import {
  Attachment,
  Channel,
  Message,
  Profile,
  ReactionSummary,
  Workspace,
  WorkspaceMember,
} from '../models';

export const DEMO_USER_ID = 'u-alex';
export const DEMO_STORAGE_KEY = 'pulsechat.demo.v2';
export const DEMO_SESSION_KEY = 'pulsechat.demo.session';

export interface DemoDatabase {
  version: number;
  profiles: Profile[];
  workspaces: Workspace[];
  workspaceMembers: WorkspaceMember[];
  channels: Channel[];
  channelMembers: Array<{ channel_id: string; user_id: string }>;
  messages: Message[];
  reads: Record<string, string>;
  stars: Record<string, string[]>;
}

interface SeedMessageInput {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  minutesAgo: number;
  parent_id?: string | null;
  attachments?: Attachment[];
  reactions?: Array<{ emoji: string; user_ids: string[] }>;
  is_pinned?: boolean;
  is_edited?: boolean;
}

function reaction(emoji: string, userIds: string[]): ReactionSummary {
  return { emoji, count: userIds.length, user_ids: userIds };
}

function attachment(
  id: string,
  name: string,
  url: string,
  type: string,
  size: number,
  width?: number,
  height?: number,
): Attachment {
  return { id, name, url, type, size, width, height };
}

export function createSeedDatabase(): DemoDatabase {
  const now = Date.now();
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  const profiles: Profile[] = [
    {
      id: 'u-alex',
      display_name: 'Alex Morgan',
      handle: 'alex',
      avatar_url: null,
      status_message: 'Crafting at the intersection of design & code',
      presence: 'online',
    },
    {
      id: 'u-maya',
      display_name: 'Maya Chen',
      handle: 'maya',
      avatar_url: null,
      status_message: 'Pixels, pastries, and very strong coffee',
      presence: 'online',
    },
    {
      id: 'u-jordan',
      display_name: 'Jordan Lee',
      handle: 'jordan',
      avatar_url: null,
      status_message: 'Shipping small, dreaming big',
      presence: 'online',
    },
    {
      id: 'u-priya',
      display_name: 'Priya Patel',
      handle: 'priya',
      avatar_url: null,
      status_message: 'Roadmaps & reality checks',
      presence: 'away',
    },
    {
      id: 'u-noah',
      display_name: 'Noah Williams',
      handle: 'noah',
      avatar_url: null,
      status_message: 'CSS is my love language',
      presence: 'online',
    },
    {
      id: 'u-sofia',
      display_name: 'Sofia Rossi',
      handle: 'sofia',
      avatar_url: null,
      status_message: 'Making things feel alive',
      presence: 'dnd',
    },
    {
      id: 'u-liam',
      display_name: 'Liam Okafor',
      handle: 'liam',
      avatar_url: null,
      status_message: 'Queues all the way down',
      presence: 'offline',
    },
    {
      id: 'u-emma',
      display_name: 'Emma Park',
      handle: 'emma',
      avatar_url: null,
      status_message: 'Stories that spread',
      presence: 'online',
    },
  ];

  const workspaces: Workspace[] = [
    {
      id: 'w-pulse',
      name: 'Pulse Studio',
      slug: 'pulse-studio',
      owner_id: 'u-jordan',
      created_at: iso(60 * 24 * 210),
      icon_emoji: '🚀',
      accent: 'indigo',
      member_count: 8,
    },
    {
      id: 'w-orbit',
      name: 'Orbit Labs',
      slug: 'orbit-labs',
      owner_id: 'u-alex',
      created_at: iso(60 * 24 * 90),
      icon_emoji: '🛰️',
      accent: 'cyan',
      member_count: 3,
    },
  ];

  const workspaceMembers: WorkspaceMember[] = [
    { workspace_id: 'w-pulse', user_id: 'u-jordan', role: 'admin' },
    { workspace_id: 'w-pulse', user_id: 'u-alex', role: 'admin' },
    { workspace_id: 'w-pulse', user_id: 'u-maya', role: 'member' },
    { workspace_id: 'w-pulse', user_id: 'u-priya', role: 'member' },
    { workspace_id: 'w-pulse', user_id: 'u-noah', role: 'member' },
    { workspace_id: 'w-pulse', user_id: 'u-sofia', role: 'member' },
    { workspace_id: 'w-pulse', user_id: 'u-liam', role: 'member' },
    { workspace_id: 'w-pulse', user_id: 'u-emma', role: 'member' },
    { workspace_id: 'w-orbit', user_id: 'u-alex', role: 'admin' },
    { workspace_id: 'w-orbit', user_id: 'u-maya', role: 'member' },
    { workspace_id: 'w-orbit', user_id: 'u-noah', role: 'member' },
  ];

  const allPulse = profiles.map((profile) => profile.id);

  const channels: Channel[] = [
    {
      id: 'c-general',
      workspace_id: 'w-pulse',
      name: 'general',
      topic: 'Company-wide announcements, wins, and the occasional meme.',
      is_private: false,
      is_dm: false,
      created_by: 'u-jordan',
      created_at: iso(60 * 24 * 210),
      last_message_at: null,
      last_message_preview: null,
      member_ids: allPulse,
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-design',
      workspace_id: 'w-pulse',
      name: 'design',
      topic: 'Critiques, explorations, and everything pixel-perfect.',
      is_private: false,
      is_dm: false,
      created_by: 'u-sofia',
      created_at: iso(60 * 24 * 180),
      last_message_at: null,
      last_message_preview: null,
      member_ids: allPulse,
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-engineering',
      workspace_id: 'w-pulse',
      name: 'engineering',
      topic: 'Ship small, ship often. Bugs welcome here.',
      is_private: false,
      is_dm: false,
      created_by: 'u-jordan',
      created_at: iso(60 * 24 * 180),
      last_message_at: null,
      last_message_preview: null,
      member_ids: allPulse,
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-launch',
      workspace_id: 'w-pulse',
      name: 'launch',
      topic: 'Nova launch war room. Confidential until Thursday 10:00.',
      is_private: true,
      is_dm: false,
      created_by: 'u-priya',
      created_at: iso(60 * 24 * 12),
      last_message_at: null,
      last_message_preview: null,
      member_ids: ['u-alex', 'u-maya', 'u-jordan', 'u-priya'],
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-random',
      workspace_id: 'w-pulse',
      name: 'random',
      topic: 'Watercooler. Dogs encouraged. 🐶',
      is_private: false,
      is_dm: false,
      created_by: 'u-emma',
      created_at: iso(60 * 24 * 200),
      last_message_at: null,
      last_message_preview: null,
      member_ids: allPulse,
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-wins',
      workspace_id: 'w-pulse',
      name: 'wins',
      topic: 'A running record of things worth celebrating.',
      is_private: false,
      is_dm: false,
      created_by: 'u-priya',
      created_at: iso(60 * 24 * 150),
      last_message_at: null,
      last_message_preview: null,
      member_ids: allPulse,
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-dm-maya',
      workspace_id: 'w-pulse',
      name: 'maya',
      topic: null,
      is_private: true,
      is_dm: true,
      created_by: 'u-maya',
      created_at: iso(60 * 24 * 60),
      last_message_at: null,
      last_message_preview: null,
      member_ids: ['u-alex', 'u-maya'],
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-dm-jordan',
      workspace_id: 'w-pulse',
      name: 'jordan',
      topic: null,
      is_private: true,
      is_dm: true,
      created_by: 'u-jordan',
      created_at: iso(60 * 24 * 45),
      last_message_at: null,
      last_message_preview: null,
      member_ids: ['u-alex', 'u-jordan'],
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-dm-priya',
      workspace_id: 'w-pulse',
      name: 'priya',
      topic: null,
      is_private: true,
      is_dm: true,
      created_by: 'u-priya',
      created_at: iso(60 * 24 * 30),
      last_message_at: null,
      last_message_preview: null,
      member_ids: ['u-alex', 'u-priya'],
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-orbit-general',
      workspace_id: 'w-orbit',
      name: 'general',
      topic: 'The home base for our research studio.',
      is_private: false,
      is_dm: false,
      created_by: 'u-alex',
      created_at: iso(60 * 24 * 90),
      last_message_at: null,
      last_message_preview: null,
      member_ids: ['u-alex', 'u-maya', 'u-noah'],
      unread_count: 0,
      mention_count: 0,
    },
    {
      id: 'c-orbit-research',
      workspace_id: 'w-orbit',
      name: 'research',
      topic: 'Notes, links, and half-formed questions.',
      is_private: false,
      is_dm: false,
      created_by: 'u-alex',
      created_at: iso(60 * 24 * 80),
      last_message_at: null,
      last_message_preview: null,
      member_ids: ['u-alex', 'u-maya', 'u-noah'],
      unread_count: 0,
      mention_count: 0,
    },
  ];

  const channelMembers = channels.flatMap((channel) =>
    channel.member_ids.map((user_id) => ({ channel_id: channel.id, user_id })),
  );

  const seedMessages: SeedMessageInput[] = [
    // #general
    {
      id: 'm-g1',
      channel_id: 'c-general',
      sender_id: 'u-priya',
      content:
        'Morning team ☀️ Reminder that **demo day is Thursday at 10:00**. Run through your flows today and drop anything broken in #engineering. @maya the new hero is looking unreal.',
      minutesAgo: 185,
      is_pinned: true,
      reactions: [
        { emoji: '👍', user_ids: ['u-alex', 'u-maya', 'u-jordan', 'u-noah', 'u-emma'] },
        { emoji: '🔥', user_ids: ['u-sofia', 'u-noah', 'u-alex'] },
        { emoji: '🎉', user_ids: ['u-maya', 'u-emma'] },
      ],
    },
    {
      id: 'm-g2',
      channel_id: 'c-general',
      sender_id: 'u-maya',
      content:
        'Thank you! Pushed the final hero polish last night — softer gradient, new product shot, and a little surprise on hover ✨',
      minutesAgo: 172,
      attachments: [
        attachment(
          'a-design-preview',
          'nova-hero-v4.svg',
          '/attachments/design-preview.svg',
          'image/svg+xml',
          182_400,
          1200,
          760,
        ),
      ],
      reactions: [{ emoji: '😍', user_ids: ['u-alex', 'u-priya', 'u-emma'] }],
    },
    {
      id: 'm-g2-r1',
      parent_id: 'm-g2',
      channel_id: 'c-general',
      sender_id: 'u-alex',
      content:
        'The hover state is *so* good. @maya can we use the same motion in the mobile header?',
      minutesAgo: 168,
    },
    {
      id: 'm-g2-r2',
      parent_id: 'm-g2',
      channel_id: 'c-general',
      sender_id: 'u-maya',
      content: 'Already prototyping it. Should have a build for you by lunch.',
      minutesAgo: 164,
      reactions: [{ emoji: '🚀', user_ids: ['u-alex', 'u-jordan'] }],
    },
    {
      id: 'm-g2-r3',
      parent_id: 'm-g2',
      channel_id: 'c-general',
      sender_id: 'u-jordan',
      content: 'This is the level of polish I was hoping for. Ship it 🚀',
      minutesAgo: 151,
    },
    {
      id: 'm-g2-r4',
      parent_id: 'm-g2',
      channel_id: 'c-general',
      sender_id: 'u-priya',
      content: 'Adding this to the demo script. It sells itself.',
      minutesAgo: 147,
      reactions: [{ emoji: '💯', user_ids: ['u-maya'] }],
    },
    {
      id: 'm-g3',
      channel_id: 'c-general',
      sender_id: 'u-noah',
      content:
        'Heads up: I fixed the websocket reconnect edge case. Turns out we were leaking a channel on every workspace switch. PR is up: https://github.com/pulsechat/pulse/pull/482',
      minutesAgo: 141,
      reactions: [
        { emoji: '👀', user_ids: ['u-alex', 'u-jordan'] },
        { emoji: '🙌', user_ids: ['u-alex', 'u-maya', 'u-priya'] },
      ],
    },
    {
      id: 'm-g4',
      channel_id: 'c-general',
      sender_id: 'u-alex',
      content:
        'Nice catch @noah. Realtime is feeling instant now — even on the private channels.',
      minutesAgo: 121,
      reactions: [{ emoji: '⚡', user_ids: ['u-noah'] }],
    },
    {
      id: 'm-g5',
      channel_id: 'c-general',
      sender_id: 'u-jordan',
      content: "Quick pulse check: what's everyone's one must-ship before Thursday?",
      minutesAgo: 94,
    },
    {
      id: 'm-g5-r1',
      parent_id: 'm-g5',
      channel_id: 'c-general',
      sender_id: 'u-sofia',
      content: 'Unified icon set across the app.',
      minutesAgo: 91,
    },
    {
      id: 'm-g5-r2',
      parent_id: 'm-g5',
      channel_id: 'c-general',
      sender_id: 'u-liam',
      content: "Read receipts that don't melt the database 😅",
      minutesAgo: 88,
      reactions: [{ emoji: '😂', user_ids: ['u-jordan', 'u-alex', 'u-noah'] }],
    },
    {
      id: 'm-g5-r3',
      parent_id: 'm-g5',
      channel_id: 'c-general',
      sender_id: 'u-emma',
      content: 'Launch post + changelog.',
      minutesAgo: 84,
    },
    {
      id: 'm-g6',
      channel_id: 'c-general',
      sender_id: 'u-emma',
      content:
        'Changelog draft is ready for review. I pulled the best bits from #design and #engineering — it reads like a proper product story now.',
      minutesAgo: 62,
      reactions: [{ emoji: '❤️', user_ids: ['u-maya', 'u-sofia', 'u-priya', 'u-jordan'] }],
    },
    {
      id: 'm-g7',
      channel_id: 'c-general',
      sender_id: 'u-alex',
      content:
        "Just tried the new command palette (⌘K). Honestly might be my favorite part of the app. @maya you're going to love the frosted glass.",
      minutesAgo: 13,
      reactions: [
        { emoji: '🚀', user_ids: ['u-maya', 'u-noah', 'u-priya'] },
        { emoji: '😍', user_ids: ['u-sofia', 'u-emma'] },
      ],
    },
    {
      id: 'm-g8',
      channel_id: 'c-general',
      sender_id: 'u-maya',
      content: "Okay that's *very* nice. The little spring on the selection is perfect 👌",
      minutesAgo: 5,
    },

    // #design
    {
      id: 'm-d1',
      channel_id: 'c-design',
      sender_id: 'u-sofia',
      content:
        'New color exploration for Nova. Leaning into the violet-to-cyan gradient — it feels energetic without being loud. Thoughts?',
      minutesAgo: 242,
      attachments: [
        attachment(
          'a-palette',
          'nova-color-exploration.svg',
          '/attachments/palette.svg',
          'image/svg+xml',
          244_000,
          1200,
          760,
        ),
      ],
      reactions: [
        { emoji: '❤️', user_ids: ['u-maya', 'u-alex', 'u-jordan', 'u-emma', 'u-noah', 'u-priya'] },
        { emoji: '🔥', user_ids: ['u-maya', 'u-alex', 'u-jordan', 'u-noah'] },
      ],
    },
    {
      id: 'm-d2',
      channel_id: 'c-design',
      sender_id: 'u-maya',
      content:
        "Obsessed with option B. The contrast on `--surface-2` is the only thing I'd nudge.",
      minutesAgo: 225,
    },
    {
      id: 'm-d2-r1',
      parent_id: 'm-d2',
      channel_id: 'c-design',
      sender_id: 'u-sofia',
      content: 'Same page. Bumping it 4% and re-checking WCAG AA.',
      minutesAgo: 219,
    },
    {
      id: 'm-d2-r2',
      parent_id: 'm-d2',
      channel_id: 'c-design',
      sender_id: 'u-alex',
      content: "Love that we're actually checking contrast before shipping. 👏",
      minutesAgo: 211,
    },
    {
      id: 'm-d2-r3',
      parent_id: 'm-d2',
      channel_id: 'c-design',
      sender_id: 'u-sofia',
      content: 'Accessibility is a feature, not a phase 😌',
      minutesAgo: 206,
      reactions: [{ emoji: '💯', user_ids: ['u-alex', 'u-maya', 'u-jordan'] }],
    },
    {
      id: 'm-d3',
      channel_id: 'c-design',
      sender_id: 'u-sofia',
      content:
        'Tiny detail: message avatars now use deterministic gradients, so every teammate has a consistent color across the workspace.',
      minutesAgo: 103,
      reactions: [{ emoji: '✨', user_ids: ['u-alex', 'u-maya', 'u-emma', 'u-noah'] }],
    },
    {
      id: 'm-d4',
      channel_id: 'c-design',
      sender_id: 'u-alex',
      content:
        'The new empty states are in. No more sad blank panels — they now nudge you toward the next action.',
      minutesAgo: 46,
    },
    {
      id: 'm-d5',
      channel_id: 'c-design',
      sender_id: 'u-maya',
      content:
        'Design file is updated with the final thread drawer specs: 380px, soft shadow, 12px radius. Dev-ready.',
      minutesAgo: 9,
      reactions: [{ emoji: '👌', user_ids: ['u-alex', 'u-sofia'] }],
    },

    // #engineering
    {
      id: 'm-e1',
      channel_id: 'c-engineering',
      sender_id: 'u-noah',
      content:
        "PSA: Postgres realtime + RLS is such a clean combo when you get the policies right. Here's the pattern we're using:\n```ts\nchannel\n  .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, patch)\n  .subscribe();\n```\nThe server decides what you can see. The client just reacts.",
      minutesAgo: 305,
      reactions: [
        { emoji: '🤯', user_ids: ['u-alex', 'u-jordan', 'u-liam'] },
        { emoji: '💡', user_ids: ['u-alex', 'u-jordan', 'u-liam', 'u-noah'] },
      ],
    },
    {
      id: 'm-e2',
      channel_id: 'c-engineering',
      sender_id: 'u-liam',
      content:
        'Added the read-state table and a trigger that keeps `last_message_at` in sync. Unread badges should be accurate across devices now.',
      minutesAgo: 262,
      reactions: [{ emoji: '🙏', user_ids: ['u-alex', 'u-jordan'] }],
    },
    {
      id: 'm-e3',
      channel_id: 'c-engineering',
      sender_id: 'u-jordan',
      content:
        'Deployed the optimistic message pipeline. Failed sends retry automatically and show a quiet inline error instead of a toast storm.',
      minutesAgo: 212,
    },
    {
      id: 'm-e4',
      channel_id: 'c-engineering',
      sender_id: 'u-noah',
      content:
        'Anyone else seeing a tiny layout shift when images load? Thinking we reserve the aspect ratio from metadata. @alex',
      minutesAgo: 91,
    },
    {
      id: 'm-e4-r1',
      parent_id: 'm-e4',
      channel_id: 'c-engineering',
      sender_id: 'u-alex',
      content: "Yes — I'll add width/height to the upload result and reserve the box.",
      minutesAgo: 86,
    },
    {
      id: 'm-e4-r2',
      parent_id: 'm-e4',
      channel_id: 'c-engineering',
      sender_id: 'u-liam',
      content: 'Can we also cap attachments to 25MB? Storage costs are real.',
      minutesAgo: 81,
    },
    {
      id: 'm-e5',
      channel_id: 'c-engineering',
      sender_id: 'u-alex',
      content:
        'Fixed. Attachments now include dimensions and a blurhash-style gradient placeholder until the image paints.',
      minutesAgo: 21,
      reactions: [{ emoji: '✅', user_ids: ['u-noah', 'u-jordan'] }],
    },

    // #launch (private)
    {
      id: 'm-l1',
      channel_id: 'c-launch',
      sender_id: 'u-priya',
      content:
        'Nova launch war room. Everything here is confidential until Thursday 10:00. @alex @maya @jordan — final checklist is pinned.',
      minutesAgo: 402,
      is_pinned: true,
      attachments: [
        attachment(
          'a-launch',
          'nova-launch-checklist.svg',
          '/attachments/launch-checklist.svg',
          'image/svg+xml',
          138_000,
          1200,
          760,
        ),
      ],
      reactions: [
        { emoji: '🔒', user_ids: ['u-alex', 'u-maya', 'u-jordan'] },
        { emoji: '🚀', user_ids: ['u-alex', 'u-maya', 'u-jordan', 'u-priya'] },
      ],
    },
    {
      id: 'm-l2',
      channel_id: 'c-launch',
      sender_id: 'u-jordan',
      content:
        "Infra is green. Rollback path tested. I'll be on call during the demo window.",
      minutesAgo: 381,
      reactions: [{ emoji: '🫡', user_ids: ['u-priya', 'u-alex'] }],
    },
    {
      id: 'm-l3',
      channel_id: 'c-launch',
      sender_id: 'u-maya',
      content:
        'Demo environment is seeded with the good data and the hero image is compressed. 1.2MB total — down from 8MB.',
      minutesAgo: 362,
      reactions: [{ emoji: '🔥', user_ids: ['u-priya', 'u-jordan', 'u-alex'] }],
    },
    {
      id: 'm-l4',
      channel_id: 'c-launch',
      sender_id: 'u-priya',
      content:
        "One day out. Sleep, hydrate, and please don't deploy after 18:00. 😄",
      minutesAgo: 32,
      reactions: [{ emoji: '😂', user_ids: ['u-alex', 'u-maya'] }],
    },

    // #random
    {
      id: 'm-r1',
      channel_id: 'c-random',
      sender_id: 'u-emma',
      content:
        'My dog has decided my keyboard is his bed. Productivity: zero. Morale: high.',
      minutesAgo: 502,
      attachments: [
        attachment(
          'a-dog',
          'employee-of-the-month.svg',
          '/attachments/dog.svg',
          'image/svg+xml',
          96_000,
          1000,
          700,
        ),
      ],
      reactions: [
        { emoji: '😂', user_ids: ['u-maya', 'u-alex', 'u-jordan', 'u-noah', 'u-sofia'] },
        { emoji: '❤️', user_ids: ['u-priya', 'u-maya', 'u-alex'] },
      ],
    },
    {
      id: 'm-r2',
      channel_id: 'c-random',
      sender_id: 'u-noah',
      content: "That's not a bug, that's a feature. 🐶",
      minutesAgo: 482,
    },
    {
      id: 'm-r3',
      channel_id: 'c-random',
      sender_id: 'u-alex',
      content: 'Friday tune: lo-fi with rain sounds. Link in thread.',
      minutesAgo: 302,
    },
    {
      id: 'm-r3-r1',
      parent_id: 'm-r3',
      channel_id: 'c-random',
      sender_id: 'u-emma',
      content: 'This is exactly the soundtrack I needed. 🌧️',
      minutesAgo: 298,
    },
    {
      id: 'm-r3-r2',
      parent_id: 'm-r3',
      channel_id: 'c-random',
      sender_id: 'u-sofia',
      content: 'Adding it to the studio playlist now.',
      minutesAgo: 290,
    },
    {
      id: 'm-r4',
      channel_id: 'c-random',
      sender_id: 'u-sofia',
      content:
        "The office plant is thriving. We're calling this a growth quarter. 🌱",
      minutesAgo: 63,
      reactions: [{ emoji: '😂', user_ids: ['u-alex', 'u-maya', 'u-noah', 'u-emma'] }],
    },
    {
      id: 'm-r5',
      channel_id: 'c-random',
      sender_id: 'u-maya',
      content: 'Coffee count: 3. Design reviews survived: 2. Remaining: 1. ☕',
      minutesAgo: 16,
    },

    // #wins
    {
      id: 'm-w1',
      channel_id: 'c-wins',
      sender_id: 'u-maya',
      content: 'We crossed **10,000 weekly active teams** 🎉',
      minutesAgo: 723,
      reactions: [
        { emoji: '🎉', user_ids: ['u-alex', 'u-jordan', 'u-priya', 'u-noah', 'u-sofia', 'u-liam', 'u-emma', 'u-maya'] },
        { emoji: '🚀', user_ids: ['u-jordan', 'u-alex'] },
      ],
    },
    {
      id: 'm-w2',
      channel_id: 'c-wins',
      sender_id: 'u-jordan',
      content: 'And p95 message latency is down to 84ms.',
      minutesAgo: 701,
      reactions: [{ emoji: '⚡', user_ids: ['u-alex', 'u-noah', 'u-maya', 'u-priya', 'u-sofia', 'u-emma'] }],
    },
    {
      id: 'm-w3',
      channel_id: 'c-wins',
      sender_id: 'u-priya',
      content:
        "Customer quote of the week: 'It finally feels like our team has a home.' 🥹",
      minutesAgo: 245,
      reactions: [{ emoji: '❤️', user_ids: ['u-alex', 'u-maya', 'u-jordan', 'u-emma', 'u-sofia', 'u-noah', 'u-liam'] }],
    },

    // DM — Maya
    {
      id: 'm-dm1',
      channel_id: 'c-dm-maya',
      sender_id: 'u-maya',
      content:
        'Hey! Do you have five minutes to look at the command palette motion? I want to make sure it feels right before I hand it off.',
      minutesAgo: 94,
    },
    {
      id: 'm-dm2',
      channel_id: 'c-dm-maya',
      sender_id: 'u-alex',
      content: "Yep — give me ten and I'll jump in.",
      minutesAgo: 89,
    },
    {
      id: 'm-dm3',
      channel_id: 'c-dm-maya',
      sender_id: 'u-maya',
      content:
        "You're the best. Also: the new avatar gradients are so satisfying.",
      minutesAgo: 82,
      reactions: [{ emoji: '🥹', user_ids: ['u-alex'] }],
    },
    {
      id: 'm-dm4',
      channel_id: 'c-dm-maya',
      sender_id: 'u-alex',
      content: 'Just left comments. The spring is perfect, maybe 20ms faster on exit?',
      minutesAgo: 61,
    },
    {
      id: 'm-dm5',
      channel_id: 'c-dm-maya',
      sender_id: 'u-maya',
      content: 'Done. Sending the build now ✨',
      minutesAgo: 54,
    },

    // DM — Jordan
    {
      id: 'm-dj1',
      channel_id: 'c-dm-jordan',
      sender_id: 'u-jordan',
      content: 'Can you review the optimistic send PR when you get a chance?',
      minutesAgo: 1_205,
    },
    {
      id: 'm-dj2',
      channel_id: 'c-dm-jordan',
      sender_id: 'u-alex',
      content: 'On it. The retry path looks solid at first glance.',
      minutesAgo: 1_182,
    },
    {
      id: 'm-dj3',
      channel_id: 'c-dm-jordan',
      sender_id: 'u-jordan',
      content: '🙏',
      minutesAgo: 1_176,
    },

    // DM — Priya
    {
      id: 'm-dp1',
      channel_id: 'c-dm-priya',
      sender_id: 'u-priya',
      content:
        "Reminder: demo script rehearsal tomorrow at 3. I'll send a calendar hold.",
      minutesAgo: 203,
    },
    {
      id: 'm-dp2',
      channel_id: 'c-dm-priya',
      sender_id: 'u-alex',
      content: "Perfect. I'll have the new composer ready.",
      minutesAgo: 192,
    },
    {
      id: 'm-dp3',
      channel_id: 'c-dm-priya',
      sender_id: 'u-priya',
      content: "You're a machine. Thank you!",
      minutesAgo: 181,
      reactions: [{ emoji: '😂', user_ids: ['u-alex'] }],
    },

    // Orbit Labs
    {
      id: 'm-o1',
      channel_id: 'c-orbit-general',
      sender_id: 'u-alex',
      content:
        'Welcome to Orbit Labs — our little research lab for experiments that do not fit on the roadmap. First rule: share the messy version.',
      minutesAgo: 60 * 24 * 4,
      is_pinned: true,
      reactions: [{ emoji: '🛰️', user_ids: ['u-maya', 'u-noah'] }],
    },
    {
      id: 'm-o2',
      channel_id: 'c-orbit-general',
      sender_id: 'u-maya',
      content: 'I have a wild idea about ambient presence in threads. Sketches tomorrow?',
      minutesAgo: 60 * 22,
      reactions: [{ emoji: '👀', user_ids: ['u-alex'] }],
    },
    {
      id: 'm-o3',
      channel_id: 'c-orbit-research',
      sender_id: 'u-noah',
      content:
        'Reading notes: CRDTs are great until someone asks for a migration. Saving this for the offline experiment.',
      minutesAgo: 60 * 30,
      reactions: [{ emoji: '📚', user_ids: ['u-alex', 'u-maya'] }],
    },
  ];

  const messages: Message[] = seedMessages.map((input) => ({
    id: input.id,
    channel_id: input.channel_id,
    parent_id: input.parent_id ?? null,
    sender_id: input.sender_id,
    content: input.content,
    attachments: input.attachments ?? [],
    is_edited: input.is_edited ?? false,
    is_pinned: input.is_pinned ?? false,
    created_at: iso(input.minutesAgo),
    reply_count: 0,
    last_reply_at: null,
    reactions: (input.reactions ?? []).map((r) => reaction(r.emoji, r.user_ids)),
  }));

  // Derive thread metadata so the seed always stays internally consistent.
  for (const message of messages) {
    if (!message.parent_id) continue;
    const parent = messages.find((candidate) => candidate.id === message.parent_id);
    if (!parent) continue;
    parent.reply_count += 1;
    if (!parent.last_reply_at || message.created_at > parent.last_reply_at) {
      parent.last_reply_at = message.created_at;
    }
  }

  // Derive channel previews from root messages.
  for (const channel of channels) {
    const roots = messages
      .filter((message) => message.channel_id === channel.id && !message.parent_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const latest = roots.at(-1);
    channel.last_message_at = latest?.created_at ?? null;
    channel.last_message_preview = latest?.content.replace(/[*_`#>]/g, '').slice(0, 120) ?? null;
  }

  const reads: Record<string, string> = {};
  const readAt = (userId: string, channelId: string, minutesAgo: number) => {
    reads[`${userId}:${channelId}`] = iso(minutesAgo);
  };

  for (const channelId of ['c-general', 'c-design', 'c-engineering', 'c-launch', 'c-random', 'c-wins']) {
    readAt(DEMO_USER_ID, channelId, channelId === 'c-general' ? 2 : 60);
  }
  readAt(DEMO_USER_ID, 'c-dm-maya', 70);
  readAt(DEMO_USER_ID, 'c-dm-jordan', 60 * 24);
  readAt(DEMO_USER_ID, 'c-dm-priya', 60 * 6);
  readAt(DEMO_USER_ID, 'c-orbit-general', 60 * 20);
  readAt(DEMO_USER_ID, 'c-orbit-research', 60 * 20);

  return {
    version: 2,
    profiles,
    workspaces,
    workspaceMembers,
    channels,
    channelMembers,
    messages,
    reads,
    stars: {
      [DEMO_USER_ID]: ['c-general', 'c-design', 'c-launch'],
    },
  };
}
