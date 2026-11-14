export type PresenceState = 'online' | 'away' | 'dnd' | 'offline';

export interface Profile {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  status_message: string | null;
  presence: PresenceState;
  email?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  icon_emoji?: string;
  accent?: string;
  member_count?: number;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: 'admin' | 'member';
  profile?: Profile;
}

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  topic: string | null;
  is_private: boolean;
  is_dm: boolean;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  member_ids: string[];
  unread_count: number;
  mention_count: number;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  user_ids: string[];
}

export interface Message {
  id: string;
  channel_id: string;
  parent_id: string | null;
  sender_id: string;
  sender?: Profile;
  content: string;
  attachments: Attachment[];
  is_edited: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at?: string;
  reply_count: number;
  last_reply_at: string | null;
  reactions: ReactionSummary[];
  pending?: boolean;
  failed?: boolean;
}

export interface TypingUser {
  user_id: string;
  display_name: string;
  handle: string;
  channel_id: string;
  expires_at: number;
}

export type PanelKind =
  | 'members'
  | 'pins'
  | 'files'
  | 'activity'
  | 'search'
  | 'profile'
  | null;

export interface MessageDraft {
  content: string;
  updated_at: number;
}

export interface SearchHit {
  message: Message;
  channel: Channel;
}

export interface ActivityItem {
  id: string;
  kind: 'mention' | 'reply' | 'reaction';
  message: Message;
  channel: Channel;
  created_at: string;
  read: boolean;
}

export interface ChannelFormValue {
  name: string;
  topic: string;
  isPrivate: boolean;
  memberIds: string[];
}

export interface WorkspaceFormValue {
  name: string;
  slug: string;
  icon: string;
}

export interface SendMessagePayload {
  content: string;
  attachments: Attachment[];
  parentId?: string | null;
}

export interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  tone: 'success' | 'error' | 'info';
}

export interface EmojiCategory {
  name: string;
  icon: string;
  emojis: string[];
}

export interface TableReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}
