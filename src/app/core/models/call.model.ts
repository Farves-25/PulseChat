export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
export type CallLayout = 'grid' | 'spotlight';

export interface CallParticipant {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  isLocal: boolean;
  isSpeaking: boolean;
  audioMuted: boolean;
  videoMuted: boolean;
  screenSharing: boolean;
  stream: MediaStream | null;
  connectionState: RTCIceConnectionState | 'connected' | 'connecting' | 'disconnected';
}

export interface ActiveCall {
  id: string;
  channelId: string;
  channelName: string;
  workspaceId: string;
  isDm: boolean;
  type: CallType;
  status: CallStatus;
  startedAt: number;
  initiatorId: string;
  initiatorName: string;
  screenShareParticipantId: string | null;
}

export interface IncomingCallNotification {
  callId: string;
  channelId: string;
  channelName: string;
  workspaceId: string;
  initiator: {
    id: string;
    displayName: string;
    handle: string;
    avatarUrl: string | null;
  };
  type: CallType;
  timestamp: number;
}

export interface SignalingMessage {
  type:
    | 'invite'
    | 'join'
    | 'leave'
    | 'offer'
    | 'answer'
    | 'ice-candidate'
    | 'media-state'
    | 'end';
  callId: string;
  channelId: string;
  senderId: string;
  targetId?: string;
  senderProfile: {
    id: string;
    displayName: string;
    handle: string;
    avatarUrl: string | null;
  };
  callType?: CallType;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  mediaState?: {
    audioMuted: boolean;
    videoMuted: boolean;
    screenSharing: boolean;
  };
}

export interface ChannelCallStatus {
  callId: string;
  channelId: string;
  type: CallType;
  participantCount: number;
  participants: Array<{
    id: string;
    displayName: string;
    avatarUrl: string | null;
  }>;
  startedAt: number;
}

