import { Service, signal } from '@angular/core';
import {
  ActivityItem,
  Attachment,
  Channel,
  Message,
  Profile,
  SearchHit,
  Workspace,
  WorkspaceMember,
} from '../models';
import {
  DEMO_SESSION_KEY,
  DEMO_STORAGE_KEY,
  DEMO_USER_ID,
  DemoDatabase,
  createSeedDatabase,
} from './demo-seed';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function newId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function plainPreview(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/[*_`#>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

interface SendDemoMessage {
  id?: string;
  channelId: string;
  senderId: string;
  content: string;
  attachments?: Attachment[];
  parentId?: string | null;
}

@Service()
export class DemoStoreService {
  private readonly database = signal<DemoDatabase>(this.loadDatabase());

  readonly active = signal(false);

  get db(): DemoDatabase {
    return this.database();
  }

  get currentUserId(): string {
    return DEMO_USER_ID;
  }

  enable(): void {
    this.active.set(true);
    try {
      localStorage.setItem(DEMO_SESSION_KEY, DEMO_USER_ID);
    } catch {
      // Storage may be unavailable in private browsing; the session still works in memory.
    }
  }

  disable(): void {
    this.active.set(false);
    try {
      localStorage.removeItem(DEMO_SESSION_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  hasDemoSession(): boolean {
    try {
      return localStorage.getItem(DEMO_SESSION_KEY) === DEMO_USER_ID;
    } catch {
      return false;
    }
  }

  reset(): void {
    this.database.set(createSeedDatabase());
    this.persist();
  }

  getCurrentProfile(): Profile {
    return this.requireProfile(DEMO_USER_ID);
  }

  getProfiles(): Profile[] {
    return this.database().profiles.map((profile) => ({ ...profile }));
  }

  getProfile(userId: string): Profile | undefined {
    return this.database().profiles.find((profile) => profile.id === userId);
  }

  requireProfile(userId: string): Profile {
    const profile = this.getProfile(userId);
    if (!profile) throw new Error(`Unknown demo profile: ${userId}`);
    return { ...profile };
  }

  getWorkspaces(userId = DEMO_USER_ID): Workspace[] {
    const memberships = this.database().workspaceMembers.filter((member) => member.user_id === userId);
    return memberships
      .map((membership) => this.database().workspaces.find((workspace) => workspace.id === membership.workspace_id))
      .filter((workspace): workspace is Workspace => Boolean(workspace))
      .map((workspace) => ({
        ...workspace,
        member_count: this.database().workspaceMembers.filter((member) => member.workspace_id === workspace.id).length,
      }));
  }

  getWorkspaceBySlug(slug: string, userId = DEMO_USER_ID): Workspace | undefined {
    return this.getWorkspaces(userId).find((workspace) => workspace.slug === slug);
  }

  getMembers(workspaceId: string): WorkspaceMember[] {
    return this.database()
      .workspaceMembers.filter((member) => member.workspace_id === workspaceId)
      .map((member) => ({ ...member, profile: this.requireProfile(member.user_id) }));
  }

  getChannel(channelId: string): Channel | undefined {
    return this.getChannels(DEMO_USER_ID).find((channel) => channel.id === channelId);
  }

  getChannelMembers(channelId: string): Profile[] {
    const channel = this.database().channels.find((candidate) => candidate.id === channelId);
    if (!channel) return [];
    return channel.member_ids.map((id) => this.requireProfile(id));
  }

  getChannels(userId = DEMO_USER_ID, workspaceId?: string): Channel[] {
    const db = this.database();
    const workspaceIds = workspaceId
      ? [workspaceId]
      : this.getWorkspaces(userId).map((workspace) => workspace.id);
    const me = this.requireProfile(userId);

    return db.channels
      .filter((channel) => workspaceIds.includes(channel.workspace_id))
      .filter((channel) => !channel.is_private || channel.member_ids.includes(userId))
      .map((channel) => {
        const roots = db.messages
          .filter((message) => message.channel_id === channel.id && !message.parent_id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        const latest = roots.at(-1);
        const readAt = db.reads[`${userId}:${channel.id}`];
        const afterRead = roots.filter(
          (message) => message.sender_id !== userId && (!readAt || message.created_at > readAt),
        );
        const mentionPattern = new RegExp(`@${me.handle}(?![a-zA-Z0-9_])`, 'i');
        const mentions = afterRead.filter((message) => mentionPattern.test(message.content));

        return {
          ...channel,
          last_message_at: latest?.created_at ?? channel.last_message_at,
          last_message_preview: latest ? plainPreview(latest.content) : channel.last_message_preview,
          unread_count: afterRead.length,
          mention_count: mentions.length,
        };
      });
  }

  getMessages(channelId: string, parentId: string | null = null): Message[] {
    return this.database()
      .messages.filter(
        (message) => message.channel_id === channelId && (message.parent_id ?? null) === parentId,
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((message) => this.hydrate(message));
  }

  getThread(parentId: string): Message[] {
    return this.database()
      .messages.filter((message) => message.parent_id === parentId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((message) => this.hydrate(message));
  }

  getMessage(messageId: string): Message | undefined {
    const message = this.database().messages.find((candidate) => candidate.id === messageId);
    return message ? this.hydrate(message) : undefined;
  }

  getPinned(channelId: string): Message[] {
    return this.database()
      .messages.filter((message) => message.channel_id === channelId && message.is_pinned)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((message) => this.hydrate(message));
  }

  getStars(userId = DEMO_USER_ID): string[] {
    return this.database().stars[userId] ?? [];
  }

  toggleStar(channelId: string, userId = DEMO_USER_ID): string[] {
    const db = this.database();
    const stars = new Set(db.stars[userId] ?? []);
    if (stars.has(channelId)) stars.delete(channelId);
    else stars.add(channelId);
    const next = [...stars];
    this.database.update((state) => ({
      ...state,
      stars: { ...state.stars, [userId]: next },
    }));
    this.persist();
    return next;
  }

  async sendMessage(input: SendDemoMessage): Promise<Message> {
    await sleep(40);

    const message: Message = {
      id: input.id ?? newId('m'),
      channel_id: input.channelId,
      parent_id: input.parentId ?? null,
      sender_id: input.senderId,
      content: input.content,
      attachments: input.attachments ?? [],
      is_edited: false,
      is_pinned: false,
      created_at: new Date().toISOString(),
      reply_count: 0,
      last_reply_at: null,
      reactions: [],
    };

    this.database.update((db) => {
      const messages = [...db.messages, message];
      let channels = db.channels;

      if (message.parent_id) {
        const index = messages.findIndex((candidate) => candidate.id === message.parent_id);
        if (index >= 0) {
          const parent = messages[index];
          messages[index] = {
            ...parent,
            reply_count: parent.reply_count + 1,
            last_reply_at: message.created_at,
          };
        }
      } else {
        channels = db.channels.map((channel) =>
          channel.id === message.channel_id
            ? {
                ...channel,
                last_message_at: message.created_at,
                last_message_preview: plainPreview(message.content),
              }
            : channel,
        );
      }

      return { ...db, messages, channels };
    });

    this.persist();
    return this.hydrate(message);
  }

  async editMessage(messageId: string, content: string): Promise<Message> {
    await sleep(30);
    this.database.update((db) => ({
      ...db,
      messages: db.messages.map((message) =>
        message.id === messageId
          ? { ...message, content, is_edited: true, updated_at: new Date().toISOString() }
          : message,
      ),
    }));
    this.persist();
    return this.getMessage(messageId) as Message;
  }

  async deleteMessage(messageId: string): Promise<void> {
    await sleep(30);
    this.database.update((db) => {
      const target = db.messages.find((message) => message.id === messageId);
      if (!target) return db;

      const idsToDelete = new Set([messageId]);
      if (!target.parent_id) {
        for (const message of db.messages) {
          if (message.parent_id === messageId) idsToDelete.add(message.id);
        }
      }

      let messages = db.messages.filter((message) => !idsToDelete.has(message.id));

      if (target.parent_id) {
        messages = messages.map((message) =>
          message.id === target.parent_id
            ? {
                ...message,
                reply_count: Math.max(0, message.reply_count - 1),
              }
            : message,
        );
      }

      return { ...db, messages };
    });
    this.persist();
  }

  async toggleReaction(messageId: string, emoji: string, userId = DEMO_USER_ID): Promise<Message | undefined> {
    this.database.update((db) => ({
      ...db,
      messages: db.messages.map((message) => {
        if (message.id !== messageId) return message;

        const reactions = message.reactions.map((reaction) => ({ ...reaction, user_ids: [...reaction.user_ids] }));
        const existing = reactions.find((reaction) => reaction.emoji === emoji);

        if (existing) {
          if (existing.user_ids.includes(userId)) {
            existing.user_ids = existing.user_ids.filter((id) => id !== userId);
          } else {
            existing.user_ids.push(userId);
          }
          existing.count = existing.user_ids.length;
        } else {
          reactions.push({ emoji, count: 1, user_ids: [userId] });
        }

        return {
          ...message,
          reactions: reactions.filter((reaction) => reaction.count > 0),
        };
      }),
    }));
    this.persist();
    return this.getMessage(messageId);
  }

  async togglePin(messageId: string): Promise<void> {
    this.database.update((db) => ({
      ...db,
      messages: db.messages.map((message) =>
        message.id === messageId ? { ...message, is_pinned: !message.is_pinned } : message,
      ),
    }));
    this.persist();
  }

  async markRead(userId: string, channelId: string): Promise<void> {
    const key = `${userId}:${channelId}`;
    this.database.update((db) => ({
      ...db,
      reads: { ...db.reads, [key]: new Date().toISOString() },
    }));
    this.persist();
  }

  async updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
    this.database.update((db) => ({
      ...db,
      profiles: db.profiles.map((profile) =>
        profile.id === userId ? { ...profile, ...patch } : profile,
      ),
    }));
    this.persist();
    return this.requireProfile(userId);
  }

  async updateChannel(channelId: string, patch: Partial<Pick<Channel, 'name' | 'topic'>>): Promise<void> {
    this.database.update((db) => ({
      ...db,
      channels: db.channels.map((channel) =>
        channel.id === channelId ? { ...channel, ...patch } : channel,
      ),
    }));
    this.persist();
  }

  async createChannel(input: {
    workspaceId: string;
    name: string;
    topic: string;
    isPrivate: boolean;
    creatorId: string;
    memberIds: string[];
  }): Promise<Channel> {
    await sleep(50);
    const db = this.database();
    const normalized = input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_ ]/g, '')
      .replace(/\s+/g, '-');

    if (
      db.channels.some(
        (channel) =>
          channel.workspace_id === input.workspaceId &&
          !channel.is_dm &&
          channel.name.toLowerCase() === normalized,
      )
    ) {
      throw new Error('A channel with that name already exists.');
    }

    const members = input.isPrivate
      ? [...new Set([input.creatorId, ...input.memberIds])]
      : this.getMembers(input.workspaceId).map((member) => member.user_id);

    const channel: Channel = {
      id: newId('c'),
      workspace_id: input.workspaceId,
      name: normalized,
      topic: input.topic || null,
      is_private: input.isPrivate,
      is_dm: false,
      created_by: input.creatorId,
      created_at: new Date().toISOString(),
      last_message_at: null,
      last_message_preview: null,
      member_ids: members,
      unread_count: 0,
      mention_count: 0,
    };

    this.database.update((state) => ({
      ...state,
      channels: [...state.channels, channel],
      channelMembers: [
        ...state.channelMembers,
        ...members.map((user_id) => ({ channel_id: channel.id, user_id })),
      ],
    }));
    this.persist();
    return channel;
  }

  async createWorkspace(input: {
    name: string;
    slug: string;
    icon: string;
    ownerId: string;
  }): Promise<Workspace> {
    await sleep(60);
    const db = this.database();
    const normalizedSlug = input.slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-');

    if (db.workspaces.some((workspace) => workspace.slug === normalizedSlug)) {
      throw new Error('That workspace URL is already taken.');
    }

    const workspace: Workspace = {
      id: newId('w'),
      name: input.name,
      slug: normalizedSlug,
      owner_id: input.ownerId,
      created_at: new Date().toISOString(),
      icon_emoji: input.icon || '✨',
      accent: 'red',
      member_count: 1,
    };

    const general: Channel = {
      id: newId('c'),
      workspace_id: workspace.id,
      name: 'general',
      topic: 'The place for team-wide announcements and conversation.',
      is_private: false,
      is_dm: false,
      created_by: input.ownerId,
      created_at: new Date().toISOString(),
      last_message_at: null,
      last_message_preview: null,
      member_ids: [input.ownerId],
      unread_count: 0,
      mention_count: 0,
    };

    const random: Channel = {
      ...general,
      id: newId('c'),
      name: 'random',
      topic: 'Watercooler talk, links, and questionable memes.',
    };

    this.database.update((state) => ({
      ...state,
      workspaces: [...state.workspaces, workspace],
      workspaceMembers: [
        ...state.workspaceMembers,
        { workspace_id: workspace.id, user_id: input.ownerId, role: 'admin' },
      ],
      channels: [...state.channels, general, random],
      channelMembers: [
        ...state.channelMembers,
        { channel_id: general.id, user_id: input.ownerId },
        { channel_id: random.id, user_id: input.ownerId },
      ],
      stars: { ...state.stars, [input.ownerId]: [...(state.stars[input.ownerId] ?? []), general.id] },
    }));
    this.persist();
    return workspace;
  }

  async startDirectMessage(workspaceId: string, userId: string, otherUserId: string): Promise<Channel> {
    await sleep(40);
    const db = this.database();
    const existing = db.channels.find(
      (channel) =>
        channel.workspace_id === workspaceId &&
        channel.is_dm &&
        channel.member_ids.length === 2 &&
        channel.member_ids.includes(userId) &&
        channel.member_ids.includes(otherUserId),
    );

    if (existing) return existing;

    const other = this.requireProfile(otherUserId);
    const channel: Channel = {
      id: newId('c'),
      workspace_id: workspaceId,
      name: other.handle,
      topic: null,
      is_private: true,
      is_dm: true,
      created_by: userId,
      created_at: new Date().toISOString(),
      last_message_at: null,
      last_message_preview: null,
      member_ids: [userId, otherUserId],
      unread_count: 0,
      mention_count: 0,
    };

    this.database.update((state) => ({
      ...state,
      channels: [...state.channels, channel],
      channelMembers: [
        ...state.channelMembers,
        { channel_id: channel.id, user_id: userId },
        { channel_id: channel.id, user_id: otherUserId },
      ],
    }));
    this.persist();
    return channel;
  }

  search(userId: string, query: string): SearchHit[] {
    const term = query.trim().toLowerCase();
    if (!term) return [];

    return this.database()
      .messages.filter((message) => message.content.toLowerCase().includes(term))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((message) => {
        const messageChannel = this.getChannels(userId).find((channel) => channel.id === message.channel_id);
        return messageChannel
          ? { message: this.hydrate(message), channel: messageChannel }
          : null;
      })
      .filter((hit): hit is SearchHit => Boolean(hit))
      .slice(0, 40);
  }

  getActivity(userId = DEMO_USER_ID): ActivityItem[] {
    const me = this.requireProfile(userId);
    const pattern = new RegExp(`@${me.handle}(?![a-zA-Z0-9_])`, 'i');
    const channels = this.getChannels(userId);
    const channelById = new Map(channels.map((channel) => [channel.id, channel]));

    return this.database()
      .messages.filter(
        (message) =>
          message.sender_id !== userId &&
          pattern.test(message.content) &&
          channelById.has(message.channel_id),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 30)
      .map((message, index) => ({
        id: `activity-${message.id}`,
        kind: 'mention' as const,
        message: this.hydrate(message),
        channel: channelById.get(message.channel_id) as Channel,
        created_at: message.created_at,
        read: index > 3,
      }));
  }

  getBotForChannel(channelId: string): Profile {
    const channel = this.database().channels.find((candidate) => candidate.id === channelId);
    const candidates = (channel?.member_ids ?? []).filter((id) => id !== DEMO_USER_ID);
    const fallback = ['u-maya', 'u-jordan', 'u-noah', 'u-priya', 'u-sofia', 'u-emma'];
    const pool = candidates.length > 0 ? candidates : fallback;
    const id = pool[Math.floor(Math.random() * pool.length)];
    return this.requireProfile(id);
  }

  async simulateReply(channelId: string, parentId: string | null): Promise<Message> {
    const bot = this.getBotForChannel(channelId);
    await sleep(1_300 + Math.random() * 1_400);

    const replies = [
      'On it — I’ll take a look this afternoon. ✨',
      'Love this. Let’s ship it. 🚀',
      'Good call. I’ll drop notes in the thread in a bit.',
      'That’s a sharp catch. Updating the checklist now.',
      'Just looked — this is much cleaner than the last pass. 👌',
      'Ha! Adding that to the demo script.',
      'Perfect timing. I was about to ask the same thing.',
      'Agreed. Let’s keep the scope tight and polish the details.',
      'This is exactly the kind of energy we need before Thursday.',
      'Sending a build in a few minutes — the motion feels *so* good now.',
    ];

    const content = replies[Math.floor(Math.random() * replies.length)];

    return this.sendMessage({
      channelId,
      parentId,
      senderId: bot.id,
      content,
    });
  }

  private hydrate(message: Message): Message {
    return {
      ...message,
      attachments: message.attachments.map((attachment) => ({ ...attachment })),
      reactions: message.reactions.map((reaction) => ({
        ...reaction,
        user_ids: [...reaction.user_ids],
      })),
      sender: this.getProfile(message.sender_id),
    };
  }

  private loadDatabase(): DemoDatabase {
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDatabase;
        if (parsed.version === 2 && Array.isArray(parsed.messages)) {
          return parsed;
        }
      }
    } catch {
      // Corrupted storage falls back to a fresh seed.
    }

    const seed = createSeedDatabase();
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(seed));
    } catch {
      // Ignore storage failures.
    }
    return seed;
  }

  private persist(): void {
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.database()));
    } catch {
      // Ignore quota errors — demo remains usable in memory.
    }
  }
}
