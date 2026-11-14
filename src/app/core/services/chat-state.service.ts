import {
  Service,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  ActivityItem,
  Attachment,
  Channel,
  ChannelFormValue,
  Message,
  MessageDraft,
  PanelKind,
  Profile,
  SearchHit,
  SendMessagePayload,
  TypingUser,
  Workspace,
  WorkspaceFormValue,
  WorkspaceMember,
} from '../models';
import { DemoStoreService } from '../demo/demo-store.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

type ConnectionState = 'connecting' | 'connected' | 'offline' | 'demo';

interface ReactionRow {
  id?: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface MessageRow {
  id: string;
  channel_id: string;
  parent_id: string | null;
  sender_id: string;
  content: string;
  attachments: Attachment[] | null;
  is_edited: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at?: string | null;
  reply_count: number | string | null;
  last_reply_at: string | null;
  sender?: Profile | null;
  reactions?: ReactionRow[] | null;
}

interface ChannelRow {
  id: string;
  workspace_id: string;
  name: string;
  topic: string | null;
  is_private: boolean;
  is_dm: boolean | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  channel_members?: Array<{ user_id: string }> | null;
}

interface MemberRow {
  workspace_id: string;
  user_id: string;
  role: 'admin' | 'member';
  profile?: Profile | null;
}

interface UnreadRow {
  channel_id: string;
  unread_count: number | string;
  mention_count: number | string;
  last_read_at: string | null;
}

interface TypingPayload {
  user_id: string;
  display_name: string;
  handle: string;
  channel_id: string;
}

interface WorkspaceMembershipRow {
  workspace: (Workspace & { member_count?: number }) | null;
}

const DRAFT_KEY = 'pulsechat.drafts';
const LAST_CHANNEL_PREFIX = 'pulsechat.lastChannel';
const STARS_PREFIX = 'pulsechat.stars';

function readDrafts(): Record<string, MessageDraft> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MessageDraft>) : {};
  } catch {
    return {};
  }
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeChannelName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

@Service()
export class ChatStateService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly demo = inject(DemoStoreService);
  private readonly toast = inject(ToastService);

  readonly workspaces = signal<Workspace[]>([]);
  readonly activeWorkspace = signal<Workspace | null>(null);
  readonly channels = signal<Channel[]>([]);
  readonly members = signal<WorkspaceMember[]>([]);
  readonly activeChannel = signal<Channel | null>(null);
  readonly messages = signal<Message[]>([]);
  readonly messagesLoading = signal(false);
  readonly workspaceLoading = signal(false);
  readonly bootstrapped = signal(false);
  readonly connection = signal<ConnectionState>('connecting');
  readonly threadParent = signal<Message | null>(null);
  readonly threadReplies = signal<Message[]>([]);
  readonly threadLoading = signal(false);
  readonly typingUsers = signal<TypingUser[]>([]);
  readonly onlineUserIds = signal<Set<string>>(new Set());
  readonly panel = signal<PanelKind>(null);
  readonly pinnedMessages = signal<Message[]>([]);
  readonly fileMessages = signal<Message[]>([]);
  readonly activity = signal<ActivityItem[]>([]);
  readonly searchResults = signal<SearchHit[]>([]);
  readonly searchQuery = signal('');
  readonly searching = signal(false);
  readonly starredChannelIds = signal<string[]>([]);
  readonly drafts = signal<Record<string, MessageDraft>>(readDrafts());
  readonly failedMessageIds = signal<Set<string>>(new Set());

  readonly currentUserId = this.auth.currentUserId;
  readonly currentProfile = this.auth.profile;

  readonly memberProfiles = computed(() =>
    this.members()
      .map((member) => member.profile)
      .filter((profile): profile is Profile => Boolean(profile)),
  );

  readonly profileById = computed(() => {
    const map = new Map<string, Profile>();
    for (const profile of this.memberProfiles()) map.set(profile.id, profile);
    const me = this.currentProfile();
    if (me) map.set(me.id, me);
    return map;
  });

  readonly publicChannels = computed(() =>
    this.channels().filter((channel) => !channel.is_private && !channel.is_dm),
  );

  readonly privateChannels = computed(() =>
    this.channels().filter((channel) => channel.is_private && !channel.is_dm),
  );

  readonly dmChannels = computed(() => this.channels().filter((channel) => channel.is_dm));

  readonly starredChannels = computed(() => {
    const starred = new Set(this.starredChannelIds());
    return this.channels().filter((channel) => starred.has(channel.id));
  });

  readonly unreadTotal = computed(() =>
    this.channels().reduce((total, channel) => total + channel.unread_count, 0),
  );

  readonly mentionTotal = computed(() =>
    this.channels().reduce((total, channel) => total + channel.mention_count, 0),
  );

  readonly onlineMembers = computed(() => {
    const online = this.onlineUserIds();
    return this.memberProfiles().filter(
      (profile) => online.has(profile.id) || (profile.presence !== 'offline' && this.auth.isDemo()),
    );
  });

  readonly activeTyping = computed(() => {
    const channelId = this.activeChannel()?.id;
    const me = this.currentUserId();
    if (!channelId) return [];
    return this.typingUsers().filter(
      (user) => user.channel_id === channelId && user.user_id !== me && user.expires_at > Date.now(),
    );
  });

  readonly typingLabel = computed(() => {
    const users = this.activeTyping();
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0].display_name} is typing`;
    if (users.length === 2) return `${users[0].display_name} and ${users[1].display_name} are typing`;
    return `${users[0].display_name} and ${users.length - 1} others are typing`;
  });

  readonly activeChannelName = computed(() => {
    const channel = this.activeChannel();
    if (!channel) return '';
    if (channel.is_dm) {
      const otherId = channel.member_ids.find((id) => id !== this.currentUserId());
      const other = otherId ? this.profileById().get(otherId) : undefined;
      return other?.display_name ?? channel.name;
    }
    return channel.name;
  });

  readonly activeChannelSubtitle = computed(() => {
    const channel = this.activeChannel();
    if (!channel) return '';
    if (channel.is_dm) {
      const otherId = channel.member_ids.find((id) => id !== this.currentUserId());
      const other = otherId ? this.profileById().get(otherId) : undefined;
      return other?.status_message ?? '';
    }
    return channel.topic ?? '';
  });

  readonly activeMembers = computed(() => {
    const channel = this.activeChannel();
    if (!channel) return [];
    const memberIds = new Set(channel.member_ids);
    return this.memberProfiles().filter((profile) => memberIds.has(profile.id));
  });

  readonly myMembership = computed(() =>
    this.members().find((member) => member.user_id === this.currentUserId()),
  );

  readonly canManageWorkspace = computed(() => this.myMembership()?.role === 'admin');

  readonly draftForActive = computed(() => {
    const id = this.activeChannel()?.id;
    return id ? (this.drafts()[id]?.content ?? '') : '';
  });

  readonly hasThread = computed(() => this.threadParent() !== null);

  private messageChannel: RealtimeChannel | null = null;
  private workspaceChannel: RealtimeChannel | null = null;
  private readonly typingTimers = new Map<string, number>();
  private lastTypingSentAt = 0;
  private markReadTimer: number | null = null;
  private bootPromise: Promise<void> | null = null;
  private hydratedProfileIds = new Set<string>();

  constructor() {
    // Keep the active workspace's member count in sync with the local list.
    effect(() => {
      const members = this.members();
      const workspace = this.activeWorkspace();
      if (!workspace) return;
      const count = members.length;
      if (count && workspace.member_count !== count) {
        untracked(() =>
          this.activeWorkspace.set({
            ...workspace,
            member_count: count,
          }),
        );
      }
    });
  }

  async bootstrap(workspaceSlug?: string | null, preferredChannelId?: string | null): Promise<void> {
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = this.runBootstrap(workspaceSlug, preferredChannelId);
    try {
      await this.bootPromise;
    } finally {
      this.bootPromise = null;
    }
  }

  private async runBootstrap(
    workspaceSlug?: string | null,
    preferredChannelId?: string | null,
  ): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) return;

    this.workspaceLoading.set(true);
    this.connection.set(this.auth.isDemo() ? 'demo' : 'connecting');

    try {
      const workspaces = await this.loadWorkspaces(userId);
      this.workspaces.set(workspaces);

      if (workspaces.length === 0) {
        this.bootstrapped.set(true);
        return;
      }

      const storedSlug = this.readStoredWorkspace();
      const target =
        workspaces.find((workspace) => workspace.slug === workspaceSlug) ??
        workspaces.find((workspace) => workspace.slug === storedSlug) ??
        workspaces[0];

      await this.loadWorkspace(target.id, preferredChannelId);
      this.bootstrapped.set(true);
    } catch (error) {
      this.toast.error('Could not load your workspace', this.errorMessage(error));
    } finally {
      this.workspaceLoading.set(false);
    }
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    if (this.activeWorkspace()?.id === workspaceId) return;
    this.closeThread();
    this.closePanel();
    await this.loadWorkspace(workspaceId);
  }

  async openChannel(channelIdOrName: string): Promise<void> {
    const channel = this.channels().find(
      (candidate) => candidate.id === channelIdOrName || candidate.name === channelIdOrName,
    );
    if (!channel) return;
    if (this.activeChannel()?.id === channel.id && this.messages().length > 0) {
      this.scheduleMarkRead(channel.id);
      return;
    }

    this.closeThread();
    this.activeChannel.set(channel);
    this.messages.set([]);
    this.messagesLoading.set(true);
    this.typingUsers.set([]);
    this.connection.set(this.auth.isDemo() ? 'demo' : 'connecting');

    try {
      const messages = await this.loadMessages(channel.id);
      this.messages.set(messages);
      this.subscribeToChannel(channel.id);
      this.scheduleMarkRead(channel.id);
      this.rememberLastChannel(channel);
    } catch (error) {
      this.toast.error('Could not load messages', this.errorMessage(error));
      this.messages.set([]);
    } finally {
      this.messagesLoading.set(false);
    }
  }

  async sendMessage(payload: SendMessagePayload): Promise<void> {
    const channel = this.activeChannel();
    const profile = this.currentProfile();
    if (!channel || !profile) return;

    const content = payload.content.trim();
    if (!content && payload.attachments.length === 0) return;

    const parentId = payload.parentId ?? null;
    const optimistic: Message = {
      id: randomId(),
      channel_id: channel.id,
      parent_id: parentId,
      sender_id: profile.id,
      sender: profile,
      content,
      attachments: payload.attachments,
      is_edited: false,
      is_pinned: false,
      created_at: new Date().toISOString(),
      reply_count: 0,
      last_reply_at: null,
      reactions: [],
      pending: true,
    };

    if (parentId) {
      this.threadReplies.update((messages) => [...messages, optimistic]);
      this.patchParentReply(parentId);
    } else {
      this.messages.update((messages) => [...messages, optimistic]);
      this.updateChannelPreview(channel.id, content || 'Attachment');
    }

    if (this.auth.isDemo()) {
      try {
        const saved = await this.demo.sendMessage({
          id: optimistic.id,
          channelId: channel.id,
          senderId: profile.id,
          content,
          attachments: payload.attachments,
          parentId,
        });
        this.replaceMessage(saved);
        this.markRead(channel.id);
        void this.simulateDemoReply(channel.id, parentId);
      } catch (error) {
        this.failMessage(optimistic.id);
        this.toast.error('Message failed to send', this.errorMessage(error));
      }
      return;
    }

    try {
      const client = this.supabase.requireClient();
      const { error } = await client.from('messages').insert({
        id: optimistic.id,
        channel_id: channel.id,
        parent_id: parentId,
        sender_id: profile.id,
        content,
        attachments: payload.attachments,
        is_edited: false,
        is_pinned: false,
        created_at: optimistic.created_at,
      });
      if (error) throw error;
      this.replaceMessage({ ...optimistic, pending: false });
      this.markRead(channel.id);
    } catch (error) {
      this.failMessage(optimistic.id);
      this.toast.error('Message failed to send', this.errorMessage(error));
    }
  }

  async retryMessage(messageId: string): Promise<void> {
    const message = this.findMessage(messageId);
    if (!message) return;
    this.removeMessageLocal(messageId);
    await this.sendMessage({
      content: message.content,
      attachments: message.attachments,
      parentId: message.parent_id,
    });
  }

  async editMessage(messageId: string, content: string): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) return;
    const existing = this.findMessage(messageId);
    if (!existing) return;

    this.patchMessage(messageId, {
      content: trimmed,
      is_edited: true,
    });

    try {
      if (this.auth.isDemo()) {
        await this.demo.editMessage(messageId, trimmed);
      } else {
        const client = this.supabase.requireClient();
        const { error } = await client
          .from('messages')
          .update({ content: trimmed, is_edited: true })
          .eq('id', messageId);
        if (error) throw error;
      }
      this.toast.success('Message updated');
    } catch (error) {
      this.patchMessage(messageId, {
        content: existing.content,
        is_edited: existing.is_edited,
      });
      this.toast.error('Could not edit message', this.errorMessage(error));
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    const existing = this.findMessage(messageId);
    if (!existing) return;

    this.removeMessageLocal(messageId);
    try {
      if (this.auth.isDemo()) {
        await this.demo.deleteMessage(messageId);
      } else {
        const client = this.supabase.requireClient();
        const { error } = await client.from('messages').delete().eq('id', messageId);
        if (error) throw error;
      }
      this.toast.success('Message deleted');
      if (this.threadParent()?.id === messageId) this.closeThread();
    } catch (error) {
      this.toast.error('Could not delete message', this.errorMessage(error));
      await this.openChannel(this.activeChannel()?.id ?? '');
    }
  }

  async toggleReaction(message: Message, emoji: string): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) return;

    this.patchMessage(message.id, {
      reactions: this.applyReaction(message.reactions, emoji, userId),
    });

    try {
      if (this.auth.isDemo()) {
        await this.demo.toggleReaction(message.id, emoji, userId);
      } else {
        const client = this.supabase.requireClient();
        const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
        const reacted = existing?.user_ids.includes(userId) ?? false;

        if (reacted) {
          const { error } = await client
            .from('reactions')
            .delete()
            .eq('message_id', message.id)
            .eq('user_id', userId)
            .eq('emoji', emoji);
          if (error) throw error;
        } else {
          const { error } = await client
            .from('reactions')
            .insert({ message_id: message.id, user_id: userId, emoji });
          if (error) throw error;
        }
      }
    } catch (error) {
      this.patchMessage(message.id, { reactions: message.reactions });
      this.toast.error('Could not update reaction', this.errorMessage(error));
    }
  }

  async togglePin(message: Message): Promise<void> {
    const nextPinned = !message.is_pinned;
    this.patchMessage(message.id, { is_pinned: nextPinned });

    try {
      if (this.auth.isDemo()) {
        await this.demo.togglePin(message.id);
      } else {
        const client = this.supabase.requireClient();
        const { error } = await client.rpc('set_message_pin', {
          p_message_id: message.id,
          p_pinned: nextPinned,
        });
        if (error) throw error;
      }
      this.toast.success(nextPinned ? 'Message pinned' : 'Message unpinned');
      if (this.panel() === 'pins') void this.loadPinned();
    } catch (error) {
      this.patchMessage(message.id, { is_pinned: message.is_pinned });
      this.toast.error('Could not update pin', this.errorMessage(error));
    }
  }

  async openThread(message: Message): Promise<void> {
    this.panel.set(null);
    this.threadParent.set(message);
    this.threadReplies.set([]);
    this.threadLoading.set(true);

    try {
      if (this.auth.isDemo()) {
        this.threadReplies.set(this.demo.getThread(message.id));
      } else {
        const client = this.supabase.requireClient();
        const { data, error } = await client
          .from('messages')
          .select('*, sender:profiles!messages_sender_id_fkey(*), reactions(*)')
          .eq('parent_id', message.id)
          .order('created_at', { ascending: true });
        if (error) throw error;
        this.threadReplies.set((data ?? []).map((row) => this.mapMessageRow(row as MessageRow)));
      }
      if (this.activeChannel()) this.scheduleMarkRead(this.activeChannel()!.id);
    } catch (error) {
      this.toast.error('Could not load thread', this.errorMessage(error));
    } finally {
      this.threadLoading.set(false);
    }
  }

  closeThread(): void {
    this.threadParent.set(null);
    this.threadReplies.set([]);
  }

  async loadPinned(): Promise<void> {
    const channel = this.activeChannel();
    if (!channel) return;
    try {
      if (this.auth.isDemo()) {
        this.pinnedMessages.set(this.demo.getPinned(channel.id));
      } else {
        const client = this.supabase.requireClient();
        const { data, error } = await client
          .from('messages')
          .select('*, sender:profiles!messages_sender_id_fkey(*), reactions(*)')
          .eq('channel_id', channel.id)
          .eq('is_pinned', true)
          .order('created_at', { ascending: false });
        if (error) throw error;
        this.pinnedMessages.set((data ?? []).map((row) => this.mapMessageRow(row as MessageRow)));
      }
    } catch (error) {
      this.toast.error('Could not load pinned messages', this.errorMessage(error));
    }
  }

  async loadFiles(): Promise<void> {
    const channel = this.activeChannel();
    if (!channel) return;
    try {
      if (this.auth.isDemo()) {
        this.fileMessages.set(
          this.messages().filter((message) => message.attachments.length > 0).reverse(),
        );
      } else {
        const client = this.supabase.requireClient();
        const { data, error } = await client
          .from('messages')
          .select('*, sender:profiles!messages_sender_id_fkey(*), reactions(*)')
          .eq('channel_id', channel.id)
          .order('created_at', { ascending: false })
          .limit(120);
        if (error) throw error;
        this.fileMessages.set(
          (data ?? [])
            .map((row) => this.mapMessageRow(row as MessageRow))
            .filter((message) => message.attachments.length > 0),
        );
      }
    } catch (error) {
      this.toast.error('Could not load files', this.errorMessage(error));
    }
  }

  async loadActivity(): Promise<void> {
    const userId = this.currentUserId();
    const profile = this.currentProfile();
    if (!userId || !profile) return;

    try {
      if (this.auth.isDemo()) {
        this.activity.set(this.demo.getActivity(userId));
        return;
      }

      const client = this.supabase.requireClient();
      const channelIds = this.channels().map((channel) => channel.id);
      if (channelIds.length === 0) {
        this.activity.set([]);
        return;
      }

      const { data, error } = await client
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(*), reactions(*)')
        .in('channel_id', channelIds)
        .neq('sender_id', userId)
        .ilike('content', `%@${profile.handle}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;

      const channelById = new Map(this.channels().map((channel) => [channel.id, channel]));
      this.activity.set(
        (data ?? [])
          .map((row) => this.mapMessageRow(row as MessageRow))
          .map<ActivityItem | null>((message, index) => {
            const channel = channelById.get(message.channel_id);
            return channel
              ? {
                  id: `activity-${message.id}`,
                  kind: 'mention',
                  message,
                  channel,
                  created_at: message.created_at,
                  read: index > 4,
                }
              : null;
          })
          .filter((item): item is ActivityItem => item !== null),
      );
    } catch (error) {
      this.toast.error('Could not load activity', this.errorMessage(error));
    }
  }

  async search(query: string): Promise<void> {
    this.searchQuery.set(query);
    const term = query.trim();
    if (!term) {
      this.searchResults.set([]);
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    const userId = this.currentUserId();
    if (!userId) return;

    try {
      if (this.auth.isDemo()) {
        this.searchResults.set(this.demo.search(userId, term));
        return;
      }

      const client = this.supabase.requireClient();
      const channelIds = this.channels().map((channel) => channel.id);
      if (channelIds.length === 0) {
        this.searchResults.set([]);
        return;
      }

      const escaped = term.replace(/[%_]/g, '\\$&');
      const { data, error } = await client
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(*), reactions(*)')
        .in('channel_id', channelIds)
        .ilike('content', `%${escaped}%`)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;

      const channelById = new Map(this.channels().map((channel) => [channel.id, channel]));
      this.searchResults.set(
        (data ?? [])
          .map((row) => this.mapMessageRow(row as MessageRow))
          .map((message) => {
            const channel = channelById.get(message.channel_id);
            return channel ? { message, channel } : null;
          })
          .filter((hit): hit is SearchHit => Boolean(hit)),
      );
    } catch (error) {
      this.toast.error('Search failed', this.errorMessage(error));
    } finally {
      this.searching.set(false);
    }
  }

  async openPanel(panel: Exclude<PanelKind, null>): Promise<void> {
    if (this.panel() === panel) {
      this.closePanel();
      return;
    }

    this.closeThread();
    this.panel.set(panel);

    if (panel === 'pins') await this.loadPinned();
    if (panel === 'files') await this.loadFiles();
    if (panel === 'activity') await this.loadActivity();
    if (panel === 'search') {
      this.searchQuery.set('');
      this.searchResults.set([]);
    }
  }

  closePanel(): void {
    this.panel.set(null);
  }

  async markRead(channelId: string): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) return;

    const timestamp = new Date().toISOString();
    this.channels.update((channels) =>
      channels.map((channel) =>
        channel.id === channelId
          ? { ...channel, unread_count: 0, mention_count: 0 }
          : channel,
      ),
    );
    const active = this.activeChannel();
    if (active?.id === channelId) {
      this.activeChannel.set({ ...active, unread_count: 0, mention_count: 0 });
    }

    try {
      if (this.auth.isDemo()) {
        await this.demo.markRead(userId, channelId);
      } else {
        const client = this.supabase.requireClient();
        const { error } = await client.from('channel_reads').upsert(
          { channel_id: channelId, user_id: userId, last_read_at: timestamp },
          { onConflict: 'channel_id,user_id' },
        );
        if (error) throw error;
      }
    } catch {
      // Read state is best-effort; local state already feels instant.
    }
  }

  async notifyTyping(): Promise<void> {
    const channel = this.activeChannel();
    const profile = this.currentProfile();
    if (!channel || !profile || this.auth.isDemo()) return;

    const now = Date.now();
    if (now - this.lastTypingSentAt < 1_800) return;
    this.lastTypingSentAt = now;

    try {
      await this.workspaceChannel?.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user_id: profile.id,
          display_name: profile.display_name,
          handle: profile.handle,
          channel_id: channel.id,
        } satisfies TypingPayload,
      });
    } catch {
      // Typing indicators are ephemeral.
    }
  }

  async createChannel(values: ChannelFormValue): Promise<Channel | null> {
    const workspace = this.activeWorkspace();
    const profile = this.currentProfile();
    if (!workspace || !profile) return null;

    const name = normalizeChannelName(values.name);
    if (!name) {
      this.toast.error('Channel name is required');
      return null;
    }

    try {
      let channel: Channel;
      if (this.auth.isDemo()) {
        channel = await this.demo.createChannel({
          workspaceId: workspace.id,
          name,
          topic: values.topic,
          isPrivate: values.isPrivate,
          creatorId: profile.id,
          memberIds: values.memberIds,
        });
      } else {
        const client = this.supabase.requireClient();
        const id = randomId();
        const { error } = await client.from('channels').insert({
          id,
          workspace_id: workspace.id,
          name,
          topic: values.topic || null,
          is_private: values.isPrivate,
          is_dm: false,
          created_by: profile.id,
        });
        if (error) throw error;

        const memberIds = values.isPrivate
          ? [...new Set([profile.id, ...values.memberIds])]
          : this.members().map((member) => member.user_id);
        const { error: memberError } = await client.from('channel_members').insert(
          memberIds.map((user_id) => ({ channel_id: id, user_id })),
        );
        if (memberError) throw memberError;

        await this.refreshChannels();
        channel =
          this.channels().find((candidate) => candidate.id === id) ??
          this.channels().find((candidate) => candidate.name === name) ??
          this.buildChannelFallback(id, workspace.id, name, values);
      }

      await this.refreshChannels();
      await this.openChannel(channel.id);
      this.toast.success(`#${name} is ready`, 'Invite your team and start the conversation.');
      return channel;
    } catch (error) {
      this.toast.error('Could not create channel', this.errorMessage(error));
      return null;
    }
  }

  async createWorkspace(values: WorkspaceFormValue): Promise<Workspace | null> {
    let profile = this.currentProfile();
    if (!profile) {
      await this.auth.refreshProfile();
      profile = this.currentProfile();
    }
    if (!profile) {
      const msg = 'User session not found. Please sign in again.';
      this.toast.error('Session required', msg);
      throw new Error(msg);
    }

    try {
      let workspace: Workspace;
      if (this.auth.isDemo()) {
        workspace = await this.demo.createWorkspace({
          name: values.name,
          slug: values.slug,
          icon: values.icon,
          ownerId: profile.id,
        });
      } else {
        const client = this.supabase.requireClient();

        // Ensure user profile exists in public.profiles to satisfy foreign keys
        const { data: existingProfile } = await client
          .from('profiles')
          .select('id')
          .eq('id', profile.id)
          .maybeSingle();

        if (!existingProfile) {
          const { error: profileErr } = await client.from('profiles').insert({
            id: profile.id,
            display_name: profile.display_name || 'Member',
            handle: profile.handle || `user_${profile.id.slice(0, 8)}`,
            status_message: profile.status_message || 'Available',
            presence: profile.presence || 'online',
            email: profile.email ?? null,
          });
          if (profileErr) {
            console.warn('Profile sync fallback warning:', profileErr.message);
          }
        }

        const normalizedSlug = values.slug.trim().toLowerCase();

        // Check if workspace with this slug already exists (e.g. from a prior partial attempt)
        const { data: existingWorkspace } = await client
          .from('workspaces')
          .select('*')
          .eq('slug', normalizedSlug)
          .maybeSingle();

        let workspaceId: string;
        if (existingWorkspace) {
          if (existingWorkspace.owner_id === profile.id) {
            workspaceId = existingWorkspace.id;
          } else {
            throw new Error(`The URL "${normalizedSlug}" is already taken. Please choose another.`);
          }
        } else {
          workspaceId = randomId();
          const { error } = await client.from('workspaces').insert({
            id: workspaceId,
            name: values.name.trim(),
            slug: normalizedSlug,
            owner_id: profile.id,
            icon_emoji: values.icon,
          });
          if (error) throw error;
        }

        // Ensure user is registered as admin member in workspace_members
        const { data: existingMember } = await client
          .from('workspace_members')
          .select('user_id')
          .eq('workspace_id', workspaceId)
          .eq('user_id', profile.id)
          .maybeSingle();

        if (!existingMember) {
          const { error: memberError } = await client
            .from('workspace_members')
            .insert({ workspace_id: workspaceId, user_id: profile.id, role: 'admin' });
          if (memberError) throw memberError;
        }

        // Ensure general and random default channels exist
        const { data: existingChannels } = await client
          .from('channels')
          .select('id, name')
          .eq('workspace_id', workspaceId);

        const channelNames = new Set((existingChannels ?? []).map((c: { name: string }) => c.name));
        const missingChannels = [
          {
            id: randomId(),
            workspace_id: workspaceId,
            name: 'general',
            topic: 'The place for team-wide announcements and conversation.',
            is_private: false,
            is_dm: false,
            created_by: profile.id,
          },
          {
            id: randomId(),
            workspace_id: workspaceId,
            name: 'random',
            topic: 'Watercooler talk, links, and questionable memes.',
            is_private: false,
            is_dm: false,
            created_by: profile.id,
          },
        ].filter((c) => !channelNames.has(c.name));

        if (missingChannels.length > 0) {
          const { error: channelError } = await client.from('channels').insert(missingChannels);
          if (channelError) throw channelError;

          const { error: membersError } = await client.from('channel_members').insert(
            missingChannels.map((channel) => ({ channel_id: channel.id, user_id: profile.id })),
          );
          if (membersError) throw membersError;
        }

        workspace = {
          id: workspaceId,
          name: existingWorkspace?.name ?? values.name.trim(),
          slug: normalizedSlug,
          owner_id: profile.id,
          created_at: existingWorkspace?.created_at ?? new Date().toISOString(),
          icon_emoji: values.icon,
          accent: 'violet',
          member_count: 1,
        };
      }

      const workspaces = await this.loadWorkspaces(profile.id);
      this.workspaces.set(workspaces);
      await this.loadWorkspace(workspace.id);
      this.toast.success('Workspace created', `Welcome to ${workspace.name}.`);
      return workspace;
    } catch (error) {
      const msg = this.errorMessage(error);
      this.toast.error('Could not create workspace', msg);
      throw new Error(msg);
    }
  }

  async startDirectMessage(otherUserId: string): Promise<Channel | null> {
    const workspace = this.activeWorkspace();
    const profile = this.currentProfile();
    if (!workspace || !profile || otherUserId === profile.id) return null;

    try {
      let channel: Channel;
      if (this.auth.isDemo()) {
        channel = await this.demo.startDirectMessage(workspace.id, profile.id, otherUserId);
      } else {
        const client = this.supabase.requireClient();
        const other = this.profileById().get(otherUserId);
        const dmKey = [profile.id, otherUserId].sort().join(':');
        const { data: existing } = await client
          .from('channels')
          .select('id')
          .eq('workspace_id', workspace.id)
          .eq('dm_key', dmKey)
          .maybeSingle();

        if (existing) {
          channel = this.buildChannelFallback(
            String((existing as { id: string }).id),
            workspace.id,
            other?.handle ?? 'direct-message',
            {
              name: other?.handle ?? 'direct-message',
              topic: '',
              isPrivate: true,
              memberIds: [otherUserId],
            },
          );
        } else {
          const id = randomId();
          const { error } = await client.from('channels').insert({
            id,
            workspace_id: workspace.id,
            name: other?.handle ?? 'direct-message',
            topic: null,
            is_private: true,
            is_dm: true,
            dm_key: dmKey,
            created_by: profile.id,
          });
          if (error) throw error;

          const { error: memberError } = await client.from('channel_members').insert([
            { channel_id: id, user_id: profile.id },
            { channel_id: id, user_id: otherUserId },
          ]);
          if (memberError) throw memberError;

          channel = this.buildChannelFallback(id, workspace.id, other?.handle ?? 'direct-message', {
            name: other?.handle ?? 'direct-message',
            topic: '',
            isPrivate: true,
            memberIds: [profile.id, otherUserId],
          });
        }
      }

      await this.refreshChannels();
      const resolved = this.channels().find((candidate) => candidate.id === channel.id) ?? channel;
      await this.openChannel(resolved.id);
      return resolved;
    } catch (error) {
      this.toast.error('Could not open conversation', this.errorMessage(error));
      return null;
    }
  }

  async updateChannelTopic(topic: string): Promise<void> {
    const channel = this.activeChannel();
    if (!channel) return;
    this.patchChannel(channel.id, { topic: topic || null });
    try {
      if (this.auth.isDemo()) {
        await this.demo.updateChannel(channel.id, { topic });
      } else {
        const client = this.supabase.requireClient();
        const { error } = await client
          .from('channels')
          .update({ topic: topic || null })
          .eq('id', channel.id);
        if (error) throw error;
      }
      this.toast.success('Channel topic updated');
    } catch (error) {
      this.toast.error('Could not update topic', this.errorMessage(error));
    }
  }

  async toggleStar(channelId: string): Promise<void> {
    if (this.auth.isDemo()) {
      const stars = this.demo.toggleStar(channelId);
      this.starredChannelIds.set(stars);
      return;
    }

    const stars = new Set(this.starredChannelIds());
    if (stars.has(channelId)) stars.delete(channelId);
    else stars.add(channelId);
    const next = [...stars];
    this.starredChannelIds.set(next);
    this.persistStars(next);
  }

  setDraft(channelId: string, content: string): void {
    this.drafts.update((drafts) => {
      const next = { ...drafts };
      if (content.trim()) {
        next[channelId] = { content, updated_at: Date.now() };
      } else {
        delete next[channelId];
      }
      return next;
    });
    this.persistDrafts();
  }

  clearDraft(channelId: string): void {
    this.setDraft(channelId, '');
  }

  updateProfileSnapshot(profile: Profile): void {
    this.members.update((members) =>
      members.map((member) =>
        member.user_id === profile.id ? { ...member, profile } : member,
      ),
    );
    this.messages.update((messages) =>
      messages.map((message) =>
        message.sender_id === profile.id ? { ...message, sender: profile } : message,
      ),
    );
    this.threadReplies.update((messages) =>
      messages.map((message) =>
        message.sender_id === profile.id ? { ...message, sender: profile } : message,
      ),
    );
    this.threadParent.update((message) =>
      message && message.sender_id === profile.id ? { ...message, sender: profile } : message,
    );
  }

  addTypingUser(profile: Profile, channelId: string, duration = 3_500): void {
    const existing = this.typingUsers().filter((user) => user.user_id !== profile.id);
    this.typingUsers.set([
      ...existing,
      {
        user_id: profile.id,
        display_name: profile.display_name,
        handle: profile.handle,
        channel_id: channelId,
        expires_at: Date.now() + duration,
      },
    ]);

    const previous = this.typingTimers.get(profile.id);
    if (previous) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      this.typingUsers.update((users) => users.filter((user) => user.user_id !== profile.id));
      this.typingTimers.delete(profile.id);
    }, duration);
    this.typingTimers.set(profile.id, timer);
  }

  async leave(): Promise<void> {
    this.disconnectChannels();
    this.workspaces.set([]);
    this.activeWorkspace.set(null);
    this.channels.set([]);
    this.members.set([]);
    this.activeChannel.set(null);
    this.messages.set([]);
    this.threadParent.set(null);
    this.threadReplies.set([]);
    this.typingUsers.set([]);
    this.onlineUserIds.set(new Set());
    this.panel.set(null);
    this.pinnedMessages.set([]);
    this.fileMessages.set([]);
    this.activity.set([]);
    this.searchResults.set([]);
    this.searchQuery.set('');
    this.starredChannelIds.set([]);
    this.bootstrapped.set(false);
    this.connection.set('connecting');
    this.hydratedProfileIds.clear();
  }

  private async loadWorkspaces(userId: string): Promise<Workspace[]> {
    if (this.auth.isDemo()) {
      return this.demo.getWorkspaces(userId);
    }

    const client = this.supabase.requireClient();
    const { data, error } = await client
      .from('workspace_members')
      .select('role, workspace:workspaces!workspace_members_workspace_id_fkey(*)')
      .eq('user_id', userId);

    if (error) throw new Error(this.auth.friendlyError(error.message));

    return ((data ?? []) as unknown as WorkspaceMembershipRow[])
      .map((row) => row.workspace)
      .filter((workspace): workspace is Workspace => Boolean(workspace));
  }

  private async loadWorkspace(
    workspaceId: string,
    preferredChannelId?: string | null,
  ): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) return;

    this.workspaceLoading.set(true);
    this.closeThread();
    this.closePanel();
    this.disconnectChannels();

    try {
      let workspace: Workspace | undefined;
      if (this.auth.isDemo()) {
        workspace = this.workspaces().find((candidate) => candidate.id === workspaceId);
        if (!workspace) throw new Error('Workspace not found');
        this.activeWorkspace.set(workspace);
        this.members.set(this.demo.getMembers(workspaceId));
        this.starredChannelIds.set(this.demo.getStars(userId));
        const channels = this.demo.getChannels(userId, workspaceId);
        this.channels.set(channels);
        this.setOnlineFromDemo();
        this.connection.set('demo');
      } else {
        workspace = this.workspaces().find((candidate) => candidate.id === workspaceId);
        if (!workspace) {
          const all = await this.loadWorkspaces(userId);
          this.workspaces.set(all);
          workspace = all.find((candidate) => candidate.id === workspaceId);
        }
        if (!workspace) throw new Error('Workspace not found');
        this.activeWorkspace.set(workspace);

        const client = this.supabase.requireClient();
        const [channelResult, memberResult, readResult, unreadResult] = await Promise.all([
          client
            .from('channels')
            .select('*, channel_members(user_id)')
            .eq('workspace_id', workspaceId)
            .order('name', { ascending: true }),
          client
            .from('workspace_members')
            .select('workspace_id, user_id, role, profile:profiles!workspace_members_user_id_fkey(*)')
            .eq('workspace_id', workspaceId),
          client
            .from('channel_reads')
            .select('channel_id, last_read_at')
            .eq('user_id', userId),
          client.rpc('get_unread_counts', { p_workspace_id: workspaceId }),
        ]);

        if (channelResult.error) throw channelResult.error;
        if (memberResult.error) throw memberResult.error;

        const unreadMap = new Map<string, UnreadRow>();
        if (!unreadResult.error && Array.isArray(unreadResult.data)) {
          for (const row of unreadResult.data as unknown as UnreadRow[]) {
            unreadMap.set(row.channel_id, row);
          }
        }

        const channels = ((channelResult.data ?? []) as unknown as ChannelRow[]).map((row) =>
          this.mapChannelRow(row, unreadMap.get(row.id)),
        );
        this.channels.set(channels);

        const members = ((memberResult.data ?? []) as unknown as MemberRow[]).map((row) => ({
          workspace_id: row.workspace_id,
          user_id: row.user_id,
          role: row.role,
          profile: row.profile ?? undefined,
        }));
        this.members.set(members);

        this.starredChannelIds.set(this.readStars());
        this.subscribeToWorkspace(workspaceId);

        if (!readResult.error && Array.isArray(readResult.data)) {
          // The unread RPC already provides last_read_at. This query is a fallback
          // for projects where the RPC has not been installed yet.
        }
      }

      this.rememberWorkspace(workspaceId);

      const storedChannelId = this.readLastChannel(workspaceId);
      const targetChannel =
        (preferredChannelId
          ? this.channels().find((channel) => channel.id === preferredChannelId)
          : null) ??
        (storedChannelId
          ? this.channels().find((channel) => channel.id === storedChannelId)
          : null) ??
        this.channels().find((channel) => !channel.is_dm) ??
        this.channels()[0];

      if (targetChannel) await this.openChannel(targetChannel.id);
    } catch (error) {
      this.toast.error('Could not load workspace', this.errorMessage(error));
    } finally {
      this.workspaceLoading.set(false);
    }
  }

  private async loadMessages(channelId: string): Promise<Message[]> {
    if (this.auth.isDemo()) {
      return this.demo.getMessages(channelId);
    }

    const client = this.supabase.requireClient();
    const { data, error } = await client
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(*), reactions(*)')
      .eq('channel_id', channelId)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
      .limit(300);

    if (error) throw new Error(this.auth.friendlyError(error.message));
    return ((data ?? []) as unknown as MessageRow[]).map((row) => this.mapMessageRow(row));
  }

  private subscribeToChannel(channelId: string): void {
    if (this.auth.isDemo() || !this.supabase.client) return;
    this.removeChannel(this.messageChannel);
    this.messageChannel = null;

    const client = this.supabase.client;
    this.messageChannel = client
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          void this.handleMessageEvent(
            payload as RealtimePostgresChangesPayload<Record<string, unknown>>,
            channelId,
          );
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.connection.set('connected');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.connection.set('offline');
      });
  }

  private subscribeToWorkspace(workspaceId: string): void {
    if (this.auth.isDemo() || !this.supabase.client) return;
    const profile = this.currentProfile();
    if (!profile) return;

    const client = this.supabase.client;
    this.removeChannel(this.workspaceChannel);
    this.workspaceChannel = null;

    const channel = client.channel(`workspace:${workspaceId}`, {
      config: {
        presence: { key: profile.id },
        broadcast: { self: false },
      },
    });

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channels', filter: `workspace_id=eq.${workspaceId}` },
        () => void this.refreshChannels(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workspace_members',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => void this.refreshMembers(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Partial<ReactionRow>;
          if (row.message_id) void this.refreshReactions(row.message_id);
        },
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<
          string,
          Array<{ user_id?: string }>
        >;
        const ids = new Set<string>();
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (entry.user_id) ids.add(entry.user_id);
          }
        }
        this.onlineUserIds.set(ids);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const typed = payload as TypingPayload;
        if (!typed?.user_id || typed.user_id === profile.id) return;
        if (typed.channel_id !== this.activeChannel()?.id) return;
        this.addTypingUser(
          {
            id: typed.user_id,
            display_name: typed.display_name,
            handle: typed.handle,
            avatar_url: null,
            status_message: null,
            presence: 'online',
          },
          typed.channel_id,
          3_800,
        );
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.connection.set('connected');
          void channel.track({
            user_id: profile.id,
            display_name: profile.display_name,
            handle: profile.handle,
            online_at: new Date().toISOString(),
          });
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.connection.set('offline');
      });

    this.workspaceChannel = channel;
  }

  private async handleMessageEvent(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    channelId: string,
  ): Promise<void> {
    const me = this.currentUserId();
    if (!me) return;

    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as MessageRow;
      const message = this.mapMessageRow(row);
      if (!message.sender) {
        void this.hydrateMessageSender(message);
      }

      if (message.parent_id) {
        if (this.threadParent()?.id === message.parent_id) {
          this.threadReplies.update((messages) =>
            messages.some((existing) => existing.id === message.id)
              ? messages
              : [...messages, message],
          );
        }
        this.patchParentReply(message.parent_id);
      } else {
        const exists = this.messages().some((existing) => existing.id === message.id);
        if (!exists) {
          this.messages.update((messages) => [...messages, message]);
        } else {
          this.replaceMessage({ ...message, pending: false });
        }

        this.updateChannelPreview(
          channelId,
          message.content || message.attachments[0]?.name || 'Attachment',
          message.created_at,
        );

        if (message.sender_id !== me) {
          if (this.activeChannel()?.id === channelId && document.visibilityState === 'visible') {
            this.scheduleMarkRead(channelId);
          } else {
            this.incrementUnread(channelId, this.mentionsMe(message));
          }
        }
      }
    }

    if (payload.eventType === 'UPDATE') {
      const row = payload.new as unknown as MessageRow;
      const existing = this.findMessage(row.id);
      const message = this.mapMessageRow(row);
      if (existing) {
        message.sender = existing.sender ?? message.sender;
        message.reactions = existing.reactions;
      }
      this.replaceMessage(message);

      if (message.parent_id) {
        const parent = this.threadParent();
        if (parent?.id === message.parent_id) {
          this.threadParent.set({
            ...parent,
            reply_count: message.reply_count,
            last_reply_at: message.last_reply_at,
          });
        }
      }
    }

    if (payload.eventType === 'DELETE') {
      const row = payload.old as Partial<MessageRow>;
      if (row.id) this.removeMessageLocal(row.id);
    }
  }

  private async refreshChannels(): Promise<void> {
    const workspace = this.activeWorkspace();
    const userId = this.currentUserId();
    if (!workspace || !userId) return;

    if (this.auth.isDemo()) {
      this.channels.set(this.demo.getChannels(userId, workspace.id));
      return;
    }

    const client = this.supabase.requireClient();
    const { data, error } = await client
      .from('channels')
      .select('*, channel_members(user_id)')
      .eq('workspace_id', workspace.id)
      .order('name', { ascending: true });
    if (error) return;

    const unreadMap = new Map(this.channels().map((channel) => [channel.id, channel]));
    const channels = ((data ?? []) as unknown as ChannelRow[]).map((row) => {
      const previous = unreadMap.get(row.id);
      const mapped = this.mapChannelRow(row);
      return {
        ...mapped,
        unread_count: previous?.unread_count ?? mapped.unread_count,
        mention_count: previous?.mention_count ?? mapped.mention_count,
      };
    });
    this.channels.set(channels);

    const active = this.activeChannel();
    if (active) {
      const updated = channels.find((channel) => channel.id === active.id);
      if (updated) this.activeChannel.set(updated);
    }
  }

  private async refreshMembers(): Promise<void> {
    const workspace = this.activeWorkspace();
    if (!workspace) return;

    if (this.auth.isDemo()) {
      this.members.set(this.demo.getMembers(workspace.id));
      return;
    }

    const client = this.supabase.requireClient();
    const { data, error } = await client
      .from('workspace_members')
      .select('workspace_id, user_id, role, profile:profiles!workspace_members_user_id_fkey(*)')
      .eq('workspace_id', workspace.id);
    if (error) return;

    this.members.set(
      ((data ?? []) as unknown as MemberRow[]).map((row) => ({
        workspace_id: row.workspace_id,
        user_id: row.user_id,
        role: row.role,
        profile: row.profile ?? undefined,
      })),
    );
  }

  private async refreshReactions(messageId: string): Promise<void> {
    if (this.auth.isDemo() || !this.supabase.client) return;
    const message = this.findMessage(messageId);
    if (!message) return;

    const { data, error } = await this.supabase.client
      .from('reactions')
      .select('emoji, user_id')
      .eq('message_id', messageId);
    if (error) return;

    const reactions = this.mapReactions((data ?? []) as unknown as ReactionRow[]);
    this.patchMessage(messageId, { reactions });
  }

  private async hydrateMessageSender(message: Message): Promise<void> {
    if (this.hydratedProfileIds.has(message.sender_id)) return;
    this.hydratedProfileIds.add(message.sender_id);

    const member = this.profileById().get(message.sender_id);
    if (member) {
      this.patchMessage(message.id, { sender: member });
      return;
    }

    try {
      const client = this.supabase.requireClient();
      const { data } = await client
        .from('profiles')
        .select('*')
        .eq('id', message.sender_id)
        .maybeSingle();
      if (data) {
        this.patchMessage(message.id, { sender: data as Profile });
      }
    } catch {
      // Leave the avatar fallback in place.
    }
  }

  private mapMessageRow(row: MessageRow): Message {
    return {
      id: row.id,
      channel_id: row.channel_id,
      parent_id: row.parent_id,
      sender_id: row.sender_id,
      sender: row.sender ?? this.profileById().get(row.sender_id),
      content: row.content,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      is_edited: Boolean(row.is_edited),
      is_pinned: Boolean(row.is_pinned),
      created_at: row.created_at,
      updated_at: row.updated_at ?? undefined,
      reply_count: Number(row.reply_count ?? 0),
      last_reply_at: row.last_reply_at,
      reactions: this.mapReactions(row.reactions ?? []),
    };
  }

  private mapChannelRow(row: ChannelRow, unread?: UnreadRow): Channel {
    const memberIds = (row.channel_members ?? []).map((member) => member.user_id);
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      name: row.name,
      topic: row.topic,
      is_private: Boolean(row.is_private),
      is_dm: Boolean(row.is_dm),
      created_by: row.created_by,
      created_at: row.created_at,
      last_message_at: row.last_message_at,
      last_message_preview: row.last_message_preview,
      member_ids: memberIds.length > 0 ? memberIds : this.members().map((member) => member.user_id),
      unread_count: Number(unread?.unread_count ?? 0),
      mention_count: Number(unread?.mention_count ?? 0),
    };
  }

  private mapReactions(rows: ReactionRow[]): Message['reactions'] {
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const users = grouped.get(row.emoji) ?? [];
      if (!users.includes(row.user_id)) users.push(row.user_id);
      grouped.set(row.emoji, users);
    }
    return [...grouped.entries()].map(([emoji, user_ids]) => ({
      emoji,
      count: user_ids.length,
      user_ids,
    }));
  }

  private applyReaction(
    reactions: Message['reactions'],
    emoji: string,
    userId: string,
  ): Message['reactions'] {
    const next = reactions.map((reaction) => ({
      ...reaction,
      user_ids: [...reaction.user_ids],
    }));
    const existing = next.find((reaction) => reaction.emoji === emoji);

    if (existing) {
      if (existing.user_ids.includes(userId)) {
        existing.user_ids = existing.user_ids.filter((id) => id !== userId);
      } else {
        existing.user_ids.push(userId);
      }
      existing.count = existing.user_ids.length;
    } else {
      next.push({ emoji, count: 1, user_ids: [userId] });
    }

    return next.filter((reaction) => reaction.count > 0);
  }

  private replaceMessage(message: Message): void {
    let found = false;
    this.messages.update((messages) =>
      messages.map((existing) => {
        if (existing.id !== message.id) return existing;
        found = true;
        return {
          ...message,
          sender: message.sender ?? existing.sender,
          reactions: message.reactions.length > 0 ? message.reactions : existing.reactions,
          pending: false,
        };
      }),
    );
    this.threadReplies.update((messages) =>
      messages.map((existing) =>
        existing.id === message.id
          ? {
              ...message,
              sender: message.sender ?? existing.sender,
              reactions: message.reactions.length > 0 ? message.reactions : existing.reactions,
              pending: false,
            }
          : existing,
      ),
    );
    this.threadParent.update((parent) =>
      parent && parent.id === message.id ? { ...parent, ...message } : parent,
    );

    if (!found && message.parent_id) {
      // A thread reply may arrive before the drawer has loaded its list.
      if (this.threadParent()?.id === message.parent_id) {
        this.threadReplies.update((messages) =>
          messages.some((existing) => existing.id === message.id) ? messages : [...messages, message],
        );
      }
    }
  }

  private patchMessage(messageId: string, patch: Partial<Message>): void {
    this.messages.update((messages) =>
      messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
    );
    this.threadReplies.update((messages) =>
      messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
    );
    this.threadParent.update((message) =>
      message && message.id === messageId ? { ...message, ...patch } : message,
    );
    this.pinnedMessages.update((messages) =>
      messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
    );
    this.fileMessages.update((messages) =>
      messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
    );
  }

  private patchChannel(channelId: string, patch: Partial<Channel>): void {
    this.channels.update((channels) =>
      channels.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel)),
    );
    const active = this.activeChannel();
    if (active?.id === channelId) this.activeChannel.set({ ...active, ...patch });
  }

  private removeMessageLocal(messageId: string): void {
    this.messages.update((messages) => messages.filter((message) => message.id !== messageId));
    this.threadReplies.update((messages) => messages.filter((message) => message.id !== messageId));
    this.pinnedMessages.update((messages) => messages.filter((message) => message.id !== messageId));
    this.fileMessages.update((messages) => messages.filter((message) => message.id !== messageId));
  }

  private failMessage(messageId: string): void {
    this.failedMessageIds.update((ids) => new Set([...ids, messageId]));
    this.messages.update((messages) =>
      messages.map((message) =>
        message.id === messageId ? { ...message, pending: false, failed: true } : message,
      ),
    );
    this.threadReplies.update((messages) =>
      messages.map((message) =>
        message.id === messageId ? { ...message, pending: false, failed: true } : message,
      ),
    );
  }

  private patchParentReply(parentId: string): void {
    this.messages.update((messages) =>
      messages.map((message) =>
        message.id === parentId
          ? {
              ...message,
              reply_count: message.reply_count + 1,
              last_reply_at: new Date().toISOString(),
            }
          : message,
      ),
    );
  }

  private updateChannelPreview(channelId: string, content: string, createdAt?: string): void {
    const preview = content.replace(/[*_`#>~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
    this.channels.update((channels) =>
      channels.map((channel) =>
        channel.id === channelId
          ? {
              ...channel,
              last_message_at: createdAt ?? new Date().toISOString(),
              last_message_preview: preview,
            }
          : channel,
      ),
    );
    const active = this.activeChannel();
    if (active?.id === channelId) {
      this.activeChannel.set({
        ...active,
        last_message_at: createdAt ?? new Date().toISOString(),
        last_message_preview: preview,
      });
    }
  }

  private incrementUnread(channelId: string, mention: boolean): void {
    this.channels.update((channels) =>
      channels.map((channel) =>
        channel.id === channelId
          ? {
              ...channel,
              unread_count: channel.unread_count + 1,
              mention_count: channel.mention_count + (mention ? 1 : 0),
            }
          : channel,
      ),
    );
  }

  private mentionsMe(message: Message): boolean {
    const handle = this.currentProfile()?.handle;
    if (!handle) return false;
    return new RegExp(`@${handle}(?![a-zA-Z0-9_])`, 'i').test(message.content);
  }

  private scheduleMarkRead(channelId: string): void {
    if (this.markReadTimer) window.clearTimeout(this.markReadTimer);
    this.markReadTimer = window.setTimeout(() => {
      void this.markRead(channelId);
    }, 450);
  }

  private async simulateDemoReply(channelId: string, parentId: string | null): Promise<void> {
    if (!this.auth.isDemo()) return;
    const bot = this.demo.getBotForChannel(channelId);
    this.addTypingUser(bot, channelId, 3_200);
    try {
      const reply = await this.demo.simulateReply(channelId, parentId);
      this.addTypingUser(bot, channelId, 100);
      if (reply.parent_id) {
        if (this.threadParent()?.id === reply.parent_id) {
          this.threadReplies.update((messages) =>
            messages.some((existing) => existing.id === reply.id) ? messages : [...messages, reply],
          );
        }
        this.patchParentReply(reply.parent_id);
      } else {
        this.messages.update((messages) =>
          messages.some((existing) => existing.id === reply.id) ? messages : [...messages, reply],
        );
        this.updateChannelPreview(channelId, reply.content, reply.created_at);
      }
    } catch {
      // Demo responses are decorative; never block sending.
    }
  }

  private findMessage(messageId: string): Message | undefined {
    return (
      this.messages().find((message) => message.id === messageId) ??
      this.threadReplies().find((message) => message.id === messageId) ??
      (this.threadParent()?.id === messageId ? this.threadParent() ?? undefined : undefined)
    );
  }

  private buildChannelFallback(
    id: string,
    workspaceId: string,
    name: string,
    values: ChannelFormValue,
  ): Channel {
    return {
      id,
      workspace_id: workspaceId,
      name,
      topic: values.topic || null,
      is_private: values.isPrivate,
      is_dm: false,
      created_by: this.currentUserId(),
      created_at: new Date().toISOString(),
      last_message_at: null,
      last_message_preview: null,
      member_ids: [...new Set([this.currentUserId() ?? '', ...values.memberIds].filter(Boolean))],
      unread_count: 0,
      mention_count: 0,
    };
  }

  private setOnlineFromDemo(): void {
    const online = new Set(
      this.memberProfiles()
        .filter((profile) => profile.presence !== 'offline')
        .map((profile) => profile.id),
    );
    this.onlineUserIds.set(online);
  }

  private async refreshChannelsAfterMembership(): Promise<void> {
    await this.refreshChannels();
  }

  private disconnectChannels(): void {
    this.removeChannel(this.messageChannel);
    this.removeChannel(this.workspaceChannel);
    this.messageChannel = null;
    this.workspaceChannel = null;
    for (const timer of this.typingTimers.values()) window.clearTimeout(timer);
    this.typingTimers.clear();
  }

  private removeChannel(channel: RealtimeChannel | null): void {
    if (!channel || !this.supabase.client) return;
    void this.supabase.client.removeChannel(channel);
  }

  private rememberWorkspace(workspaceId: string): void {
    try {
      localStorage.setItem('pulsechat.lastWorkspace', workspaceId);
    } catch {
      // Ignore storage failures.
    }
  }

  private readStoredWorkspace(): string | null {
    try {
      return localStorage.getItem('pulsechat.lastWorkspace');
    } catch {
      return null;
    }
  }

  private rememberLastChannel(channel: Channel): void {
    try {
      localStorage.setItem(`${LAST_CHANNEL_PREFIX}.${channel.workspace_id}`, channel.id);
    } catch {
      // Ignore storage failures.
    }
  }

  private readLastChannel(workspaceId: string): string | null {
    try {
      return localStorage.getItem(`${LAST_CHANNEL_PREFIX}.${workspaceId}`);
    } catch {
      return null;
    }
  }

  private readStars(): string[] {
    const userId = this.currentUserId();
    const workspaceId = this.activeWorkspace()?.id;
    if (!userId || !workspaceId) return [];
    try {
      const raw = localStorage.getItem(`${STARS_PREFIX}.${userId}.${workspaceId}`);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  private persistStars(stars: string[]): void {
    const userId = this.currentUserId();
    const workspaceId = this.activeWorkspace()?.id;
    if (!userId || !workspaceId) return;
    try {
      localStorage.setItem(`${STARS_PREFIX}.${userId}.${workspaceId}`, JSON.stringify(stars));
    } catch {
      // Ignore storage failures.
    }
  }

  private persistDrafts(): void {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this.drafts()));
    } catch {
      // Ignore storage failures.
    }
  }

  private errorMessage(error: unknown): string {
    console.error('[PulseChat] Action error:', error);
    if (error && typeof error === 'object') {
      const candidate = error as {
        message?: unknown;
        error_description?: unknown;
        details?: unknown;
        hint?: unknown;
      };
      const message =
        typeof candidate.message === 'string' && candidate.message
          ? candidate.message
          : typeof candidate.error_description === 'string' && candidate.error_description
            ? candidate.error_description
            : typeof candidate.details === 'string' && candidate.details
              ? candidate.details
              : typeof candidate.hint === 'string' && candidate.hint
                ? candidate.hint
                : error instanceof Error
                  ? error.message
                  : null;

      if (message) {
        const lower = message.toLowerCase();
        if (
          lower.includes('workspaces_slug_key') ||
          (lower.includes('duplicate key') && lower.includes('slug'))
        ) {
          return 'That workspace URL is already in use. Please choose a different URL.';
        }
        if (lower.includes('violates foreign key constraint') && lower.includes('owner_id')) {
          return 'User profile not found. Please refresh and try again.';
        }
        if (lower.includes('violates row-level security policy')) {
          return 'Permission denied: please check your Supabase schema and policies.';
        }
        return message;
      }
    }
    if (typeof error === 'string') return error;
    return 'Something went wrong. Please try again.';
  }
}
