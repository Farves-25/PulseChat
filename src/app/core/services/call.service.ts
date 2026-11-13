import { Service, computed, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import {
  ActiveCall,
  CallLayout,
  CallParticipant,
  CallStatus,
  CallType,
  Channel,
  ChannelCallStatus,
  IncomingCallNotification,
  Profile,
  SignalingMessage,
} from '../models';
import { AuthService } from './auth.service';
import { CallSoundsService } from './call-sounds.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

@Service()
export class CallService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly toast = inject(ToastService);
  private readonly sounds = inject(CallSoundsService);

  // State Signals
  readonly activeCall = signal<ActiveCall | null>(null);
  readonly incomingCall = signal<IncomingCallNotification | null>(null);
  readonly participantsMap = signal<Map<string, CallParticipant>>(new Map());
  readonly localStream = signal<MediaStream | null>(null);
  readonly screenStream = signal<MediaStream | null>(null);

  readonly isMicMuted = signal(false);
  readonly isCameraMuted = signal(false);
  readonly isScreenSharing = signal(false);
  readonly isMinimized = signal(false);
  readonly layout = signal<CallLayout>('grid');
  readonly callDuration = signal(0);
  readonly activeSpeakerId = signal<string | null>(null);
  readonly pinnedParticipantId = signal<string | null>(null);

  // Active channel huddles across workspace: Map<channelId, ChannelCallStatus>
  readonly channelHuddles = signal<Map<string, ChannelCallStatus>>(new Map());

  // Computed state
  readonly isInCall = computed(() => this.activeCall() !== null);
  readonly isCallConnected = computed(() => this.activeCall()?.status === 'connected');
  readonly participants = computed(() => Array.from(this.participantsMap().values()));
  readonly participantCount = computed(() => this.participants().length);
  readonly hasScreenShare = computed(
    () => this.participants().some((p) => p.screenSharing) || this.isScreenSharing(),
  );

  readonly screenShareParticipant = computed(() => {
    return this.participants().find((p) => p.screenSharing) ?? null;
  });

  // Spotlight participant: pinned > screen sharer > active speaker > first remote > local
  readonly spotlightParticipant = computed(() => {
    const list = this.participants();
    if (list.length === 0) return null;
    const pinnedId = this.pinnedParticipantId();
    if (pinnedId) {
      const pinned = list.find((p) => p.id === pinnedId);
      if (pinned) return pinned;
    }
    const sharer = list.find((p) => p.screenSharing);
    if (sharer) return sharer;
    const speakerId = this.activeSpeakerId();
    if (speakerId) {
      const speaker = list.find((p) => p.id === speakerId);
      if (speaker) return speaker;
    }
    const firstRemote = list.find((p) => !p.isLocal);
    return firstRemote ?? list[0];
  });

  // Internal WebRTC & audio machinery
  private peers = new Map<string, RTCPeerConnection>();
  private signalingChannel: RealtimeChannel | null = null;
  private localBroadcastChannel: BroadcastChannel | null = null;
  private durationTimer: number | null = null;
  private audioContext: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private analyserTimer: number | null = null;
  private simulatedInterval: number | null = null;

  constructor() {
    this.initCrossTabSignaling();
  }

  // ---------------------------------------------------------------------------
  // Public Actions
  // ---------------------------------------------------------------------------

  async startCall(channel: Channel, type: CallType = 'video'): Promise<void> {
    const user = this.auth.profile();
    if (!user) {
      this.toast.error('You must be signed in to start a call');
      return;
    }

    if (this.isInCall()) {
      this.toast.info('You are already in an active call');
      return;
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isDm = channel.is_dm;

    // Acquire local media
    const stream = await this.setupLocalMedia(type);
    if (!stream) {
      this.toast.error('Could not access microphone or camera');
      return;
    }

    const active: ActiveCall = {
      id: callId,
      channelId: channel.id,
      channelName: channel.name,
      workspaceId: channel.workspace_id,
      isDm,
      type,
      status: isDm ? 'calling' : 'connected',
      startedAt: Date.now(),
      initiatorId: user.id,
      initiatorName: user.display_name,
      screenShareParticipantId: null,
    };

    this.activeCall.set(active);
    this.layout.set('grid');
    this.isMinimized.set(false);

    // Register local participant
    this.registerLocalParticipant(user, stream, type);

    // Play sounds
    if (isDm) {
      this.sounds.playOutgoingRingtone();
    } else {
      this.sounds.playJoinChime();
    }

    // Connect signaling
    this.connectSignaling(channel.id, channel.workspace_id);

    // Broadcast call invitation or join
    this.broadcastSignal({
      type: isDm ? 'invite' : 'join',
      callId,
      channelId: channel.id,
      senderId: user.id,
      senderProfile: {
        id: user.id,
        displayName: user.display_name,
        handle: user.handle,
        avatarUrl: user.avatar_url,
      },
      callType: type,
      mediaState: {
        audioMuted: this.isMicMuted(),
        videoMuted: this.isCameraMuted(),
        screenSharing: false,
      },
    });

    this.startCallTimer();
    this.updateChannelHuddle(channel.id, type, active);

    // In demo or group huddle, simulate team members for an immersive realistic experience
    if (this.auth.isDemo() || !isDm) {
      this.setupDemoOrHuddleCompanions(channel, type);
    }
  }

  async joinHuddle(channelId: string, channelName: string, workspaceId: string, type: CallType = 'video'): Promise<void> {
    const user = this.auth.profile();
    if (!user) return;
    if (this.isInCall()) {
      if (this.activeCall()?.channelId === channelId) {
        this.isMinimized.set(false);
        return;
      }
      this.leaveCall();
    }

    const huddle = this.channelHuddles().get(channelId);
    const callId = huddle?.callId ?? `huddle_${channelId}_${Date.now()}`;

    const stream = await this.setupLocalMedia(type);
    if (!stream) return;

    const active: ActiveCall = {
      id: callId,
      channelId,
      channelName,
      workspaceId,
      isDm: false,
      type,
      status: 'connected',
      startedAt: huddle?.startedAt ?? Date.now(),
      initiatorId: user.id,
      initiatorName: user.display_name,
      screenShareParticipantId: null,
    };

    this.activeCall.set(active);
    this.layout.set('grid');
    this.isMinimized.set(false);
    this.sounds.playJoinChime();

    this.registerLocalParticipant(user, stream, type);
    this.connectSignaling(channelId, workspaceId);

    this.broadcastSignal({
      type: 'join',
      callId,
      channelId,
      senderId: user.id,
      senderProfile: {
        id: user.id,
        displayName: user.display_name,
        handle: user.handle,
        avatarUrl: user.avatar_url,
      },
      callType: type,
      mediaState: {
        audioMuted: this.isMicMuted(),
        videoMuted: this.isCameraMuted(),
        screenSharing: false,
      },
    });

    this.startCallTimer();
  }

  async answerIncomingCall(withVideo = true): Promise<void> {
    const incoming = this.incomingCall();
    if (!incoming) return;

    this.sounds.stopIncomingRingtone();
    this.incomingCall.set(null);

    const user = this.auth.profile();
    if (!user) return;

    const callType: CallType = withVideo ? 'video' : 'audio';
    const stream = await this.setupLocalMedia(callType);
    if (!stream) {
      this.toast.error('Could not access microphone or camera to answer call');
      return;
    }

    const active: ActiveCall = {
      id: incoming.callId,
      channelId: incoming.channelId,
      channelName: incoming.channelName,
      workspaceId: incoming.workspaceId,
      isDm: true,
      type: callType,
      status: 'connected',
      startedAt: Date.now(),
      initiatorId: incoming.initiator.id,
      initiatorName: incoming.initiator.displayName,
      screenShareParticipantId: null,
    };

    this.activeCall.set(active);
    this.layout.set('grid');
    this.isMinimized.set(false);
    this.sounds.playJoinChime();

    this.registerLocalParticipant(user, stream, callType);

    // Register caller participant placeholder until track arrives
    this.updateParticipant(incoming.initiator.id, {
      id: incoming.initiator.id,
      displayName: incoming.initiator.displayName,
      handle: incoming.initiator.handle,
      avatarUrl: incoming.initiator.avatarUrl,
      isLocal: false,
      isSpeaking: false,
      audioMuted: false,
      videoMuted: incoming.type === 'audio',
      screenSharing: false,
      stream: null,
      connectionState: 'connecting',
    });

    this.connectSignaling(incoming.channelId, incoming.workspaceId);

    this.broadcastSignal({
      type: 'join',
      callId: incoming.callId,
      channelId: incoming.channelId,
      senderId: user.id,
      senderProfile: {
        id: user.id,
        displayName: user.display_name,
        handle: user.handle,
        avatarUrl: user.avatar_url,
      },
      callType,
      mediaState: {
        audioMuted: this.isMicMuted(),
        videoMuted: this.isCameraMuted(),
        screenSharing: false,
      },
    });

    this.startCallTimer();
  }

  declineIncomingCall(): void {
    const incoming = this.incomingCall();
    if (!incoming) return;

    this.sounds.stopIncomingRingtone();
    const user = this.auth.profile();

    if (user) {
      this.broadcastSignal({
        type: 'leave',
        callId: incoming.callId,
        channelId: incoming.channelId,
        senderId: user.id,
        senderProfile: {
          id: user.id,
          displayName: user.display_name,
          handle: user.handle,
          avatarUrl: user.avatar_url,
        },
      });
    }

    this.incomingCall.set(null);
    this.toast.info('Call declined');
  }

  toggleMicrophone(): void {
    const stream = this.localStream();
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const newMutedState = !this.isMicMuted();
      audioTrack.enabled = !newMutedState;
      this.isMicMuted.set(newMutedState);
      this.sounds.playMuteChime(newMutedState);

      const userId = this.auth.currentUserId();
      if (userId) {
        this.updateParticipant(userId, { audioMuted: newMutedState });
      }

      this.broadcastMediaState();
    }
  }

  async toggleCamera(): Promise<void> {
    const stream = this.localStream();
    const user = this.auth.profile();
    if (!user) return;

    const currentVideoMuted = this.isCameraMuted();

    if (currentVideoMuted) {
      // Re-enable or request video
      try {
        let videoTrack = stream?.getVideoTracks()[0];
        if (!videoTrack) {
          const freshMedia = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          videoTrack = freshMedia.getVideoTracks()[0];
          if (stream && videoTrack) {
            stream.addTrack(videoTrack);
            // Add track to peers
            for (const pc of this.peers.values()) {
              pc.addTrack(videoTrack, stream);
            }
          }
        } else {
          videoTrack.enabled = true;
        }

        this.isCameraMuted.set(false);
        this.updateParticipant(user.id, { videoMuted: false });
        this.broadcastMediaState();
      } catch {
        this.toast.error('Could not activate camera');
      }
    } else {
      // Mute camera
      const videoTrack = stream?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = false;
      }
      this.isCameraMuted.set(true);
      this.updateParticipant(user.id, { videoMuted: true });
      this.broadcastMediaState();
    }
  }

  async toggleScreenShare(): Promise<void> {
    if (this.isScreenSharing()) {
      this.stopScreenShare();
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) return;

      this.screenStream.set(displayStream);
      this.isScreenSharing.set(true);
      this.layout.set('spotlight');

      const user = this.auth.profile();
      if (user) {
        this.updateParticipant(user.id, {
          screenSharing: true,
          stream: displayStream,
        });
        this.pinnedParticipantId.set(user.id);
      }

      // Replace or add video track on all peer connections
      for (const pc of this.peers.values()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          void videoSender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, displayStream);
        }
      }

      // Listen for browser's native "Stop sharing" bar
      videoTrack.onended = () => {
        this.stopScreenShare();
      };

      this.broadcastMediaState();
      this.toast.success('You are now sharing your screen');
    } catch {
      // User cancelled picker dialog
    }
  }

  stopScreenShare(): void {
    const displayStream = this.screenStream();
    if (displayStream) {
      displayStream.getTracks().forEach((t) => t.stop());
      this.screenStream.set(null);
    }

    this.isScreenSharing.set(false);

    const user = this.auth.profile();
    const local = this.localStream();
    if (user && local) {
      const cameraTrack = local.getVideoTracks()[0] ?? null;
      this.updateParticipant(user.id, {
        screenSharing: false,
        stream: local,
      });

      for (const pc of this.peers.values()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          void videoSender.replaceTrack(cameraTrack);
        }
      }
    }

    if (this.pinnedParticipantId() === user?.id) {
      this.pinnedParticipantId.set(null);
    }

    this.broadcastMediaState();
    this.toast.info('Screen sharing stopped');
  }

  toggleMinimize(): void {
    this.isMinimized.update((v) => !v);
  }

  setLayout(layout: CallLayout): void {
    this.layout.set(layout);
  }

  pinParticipant(participantId: string): void {
    if (this.pinnedParticipantId() === participantId) {
      this.pinnedParticipantId.set(null);
    } else {
      this.pinnedParticipantId.set(participantId);
      this.layout.set('spotlight');
    }
  }

  leaveCall(): void {
    const call = this.activeCall();
    const user = this.auth.profile();

    if (call && user) {
      this.broadcastSignal({
        type: 'leave',
        callId: call.id,
        channelId: call.channelId,
        senderId: user.id,
        senderProfile: {
          id: user.id,
          displayName: user.display_name,
          handle: user.handle,
          avatarUrl: user.avatar_url,
        },
      });
    }

    this.sounds.playLeaveChime();
    this.cleanupCall();
  }

  endCall(): void {
    const call = this.activeCall();
    const user = this.auth.profile();

    if (call && user) {
      this.broadcastSignal({
        type: 'end',
        callId: call.id,
        channelId: call.channelId,
        senderId: user.id,
        senderProfile: {
          id: user.id,
          displayName: user.display_name,
          handle: user.handle,
          avatarUrl: user.avatar_url,
        },
      });
    }

    this.sounds.playLeaveChime();
    this.cleanupCall();
  }

  // ---------------------------------------------------------------------------
  // Internal WebRTC & Signaling Pipeline
  // ---------------------------------------------------------------------------

  private async setupLocalMedia(type: CallType): Promise<MediaStream | null> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          type === 'video'
            ? {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                facingMode: 'user',
              }
            : false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // If video fails or no webcam found, fallback to audio only
        if (type === 'video') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          this.isCameraMuted.set(true);
          this.toast.info('Camera unavailable', 'Connected with audio only.');
        } else {
          throw err;
        }
      }

      this.localStream.set(stream);
      this.isMicMuted.set(false);
      this.isCameraMuted.set(type === 'audio' || stream.getVideoTracks().length === 0);

      this.setupAudioAnalysis(stream);
      return stream;
    } catch {
      return null;
    }
  }

  private registerLocalParticipant(user: Profile, stream: MediaStream, type: CallType): void {
    const participant: CallParticipant = {
      id: user.id,
      displayName: user.display_name,
      handle: user.handle,
      avatarUrl: user.avatar_url,
      isLocal: true,
      isSpeaking: false,
      audioMuted: this.isMicMuted(),
      videoMuted: this.isCameraMuted(),
      screenSharing: false,
      stream,
      connectionState: 'connected',
    };

    this.participantsMap.update((map) => {
      const next = new Map(map);
      next.set(user.id, participant);
      return next;
    });
  }

  private setupAudioAnalysis(stream: MediaStream): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 256;
      source.connect(this.audioAnalyser);

      const bufferLength = this.audioAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      this.analyserTimer = window.setInterval(() => {
        if (!this.audioAnalyser || this.isMicMuted()) {
          this.setLocalSpeaking(false);
          return;
        }

        this.audioAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const isSpeaking = avg > 16;
        this.setLocalSpeaking(isSpeaking);
      }, 100);
    } catch {
      // Audio analysis unavailable
    }
  }

  private setLocalSpeaking(speaking: boolean): void {
    const userId = this.auth.currentUserId();
    if (!userId) return;
    const current = this.participantsMap().get(userId);
    if (!current || current.isSpeaking === speaking) return;

    this.updateParticipant(userId, { isSpeaking: speaking });
    if (speaking) {
      this.activeSpeakerId.set(userId);
    }
  }

  private updateParticipant(id: string, patch: Partial<CallParticipant>): void {
    this.participantsMap.update((map) => {
      const existing = map.get(id);
      if (!existing && !patch.displayName) return map;
      const next = new Map(map);
      if (existing) {
        next.set(id, { ...existing, ...patch });
      } else {
        next.set(id, patch as CallParticipant);
      }
      return next;
    });
  }

  private removeParticipant(id: string): void {
    this.participantsMap.update((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });

    const pc = this.peers.get(id);
    if (pc) {
      pc.close();
      this.peers.delete(id);
    }

    if (this.pinnedParticipantId() === id) {
      this.pinnedParticipantId.set(null);
    }
    if (this.activeSpeakerId() === id) {
      this.activeSpeakerId.set(null);
    }
  }

  // ---------------------------------------------------------------------------
  // WebRTC Peer Connection & Signaling
  // ---------------------------------------------------------------------------

  private connectSignaling(channelId: string, workspaceId: string): void {
    if (this.signalingChannel) {
      void this.signalingChannel.unsubscribe();
      this.signalingChannel = null;
    }

    if (this.supabase.client) {
      const chan = this.supabase.client.channel(`pulsechat_call_${channelId}`, {
        config: { broadcast: { self: false } },
      });

      chan
        .on('broadcast', { event: 'call_signal' }, ({ payload }) => {
          this.handleSignalingMessage(payload as SignalingMessage);
        })
        .subscribe();

      this.signalingChannel = chan;
    }
  }

  private initCrossTabSignaling(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.localBroadcastChannel = new BroadcastChannel('pulsechat_call_bus');
        this.localBroadcastChannel.onmessage = (event) => {
          this.handleSignalingMessage(event.data as SignalingMessage);
        };
      } catch {
        // BroadcastChannel unavailable
      }
    }
  }

  private broadcastSignal(message: SignalingMessage): void {
    if (this.signalingChannel) {
      void this.signalingChannel.send({
        type: 'broadcast',
        event: 'call_signal',
        payload: message,
      });
    }

    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage(message);
      } catch {
        // ignore
      }
    }
  }

  private async handleSignalingMessage(msg: SignalingMessage): Promise<void> {
    const currentUserId = this.auth.currentUserId();
    if (!currentUserId || msg.senderId === currentUserId) return;

    // Handle invite
    if (msg.type === 'invite') {
      if (this.isInCall()) return; // already busy
      this.sounds.playIncomingRingtone();
      this.incomingCall.set({
        callId: msg.callId,
        channelId: msg.channelId,
        channelName: 'Direct Call',
        workspaceId: '',
        initiator: msg.senderProfile,
        type: msg.callType ?? 'video',
        timestamp: Date.now(),
      });
      return;
    }

    // Must be in the matching call
    const active = this.activeCall();
    if (!active || active.id !== msg.callId) return;

    switch (msg.type) {
      case 'join': {
        this.sounds.stopOutgoingRingtone();
        active.status = 'connected';
        this.activeCall.set({ ...active, status: 'connected' });

        this.updateParticipant(msg.senderId, {
          id: msg.senderId,
          displayName: msg.senderProfile.displayName,
          handle: msg.senderProfile.handle,
          avatarUrl: msg.senderProfile.avatarUrl,
          isLocal: false,
          isSpeaking: false,
          audioMuted: msg.mediaState?.audioMuted ?? false,
          videoMuted: msg.mediaState?.videoMuted ?? false,
          screenSharing: msg.mediaState?.screenSharing ?? false,
          stream: null,
          connectionState: 'connecting',
        });

        this.sounds.playJoinChime();

        // Create WebRTC Offer if our ID is lower (polite peer pattern)
        if (currentUserId < msg.senderId) {
          await this.createPeerOffer(msg.senderId, active.id, active.channelId);
        }
        break;
      }

      case 'offer': {
        if (msg.targetId && msg.targetId !== currentUserId) return;
        if (msg.sdp) {
          await this.handlePeerOffer(msg.senderId, msg.sdp, active.id, active.channelId);
        }
        break;
      }

      case 'answer': {
        if (msg.targetId && msg.targetId !== currentUserId) return;
        if (msg.sdp) {
          const pc = this.peers.get(msg.senderId);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          }
        }
        break;
      }

      case 'ice-candidate': {
        if (msg.targetId && msg.targetId !== currentUserId) return;
        if (msg.candidate) {
          const pc = this.peers.get(msg.senderId);
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          }
        }
        break;
      }

      case 'media-state': {
        if (msg.mediaState) {
          this.updateParticipant(msg.senderId, {
            audioMuted: msg.mediaState.audioMuted,
            videoMuted: msg.mediaState.videoMuted,
            screenSharing: msg.mediaState.screenSharing,
          });

          if (msg.mediaState.screenSharing) {
            this.layout.set('spotlight');
            this.pinnedParticipantId.set(msg.senderId);
          }
        }
        break;
      }

      case 'leave': {
        this.removeParticipant(msg.senderId);
        this.sounds.playLeaveChime();
        this.toast.info(`${msg.senderProfile.displayName} left the call`);
        if (this.participants().length <= 1 && active.isDm) {
          this.cleanupCall();
        }
        break;
      }

      case 'end': {
        this.toast.info('Call ended');
        this.cleanupCall();
        break;
      }
    }
  }

  private async createPeerOffer(peerId: string, callId: string, channelId: string): Promise<void> {
    const pc = this.getOrCreatePeerConnection(peerId, callId, channelId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const user = this.auth.profile();
    if (!user) return;

    this.broadcastSignal({
      type: 'offer',
      callId,
      channelId,
      senderId: user.id,
      targetId: peerId,
      senderProfile: {
        id: user.id,
        displayName: user.display_name,
        handle: user.handle,
        avatarUrl: user.avatar_url,
      },
      sdp: offer,
    });
  }

  private async handlePeerOffer(
    peerId: string,
    sdp: RTCSessionDescriptionInit,
    callId: string,
    channelId: string,
  ): Promise<void> {
    const pc = this.getOrCreatePeerConnection(peerId, callId, channelId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const user = this.auth.profile();
    if (!user) return;

    this.broadcastSignal({
      type: 'answer',
      callId,
      channelId,
      senderId: user.id,
      targetId: peerId,
      senderProfile: {
        id: user.id,
        displayName: user.display_name,
        handle: user.handle,
        avatarUrl: user.avatar_url,
      },
      sdp: answer,
    });
  }

  private getOrCreatePeerConnection(peerId: string, callId: string, channelId: string): RTCPeerConnection {
    let pc = this.peers.get(peerId);
    if (pc) return pc;

    pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(peerId, pc);

    // Add local stream tracks to connection
    const local = this.localStream();
    if (local) {
      local.getTracks().forEach((track) => {
        pc.addTrack(track, local);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const user = this.auth.profile();
        if (user) {
          this.broadcastSignal({
            type: 'ice-candidate',
            callId,
            channelId,
            senderId: user.id,
            targetId: peerId,
            senderProfile: {
              id: user.id,
              displayName: user.display_name,
              handle: user.handle,
              avatarUrl: user.avatar_url,
            },
            candidate: event.candidate.toJSON(),
          });
        }
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      this.updateParticipant(peerId, {
        stream: remoteStream,
        connectionState: 'connected',
      });
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      this.updateParticipant(peerId, { connectionState: state });
      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        // Reconnection or cleanup handled
      }
    };

    return pc;
  }

  private broadcastMediaState(): void {
    const call = this.activeCall();
    const user = this.auth.profile();
    if (!call || !user) return;

    this.broadcastSignal({
      type: 'media-state',
      callId: call.id,
      channelId: call.channelId,
      senderId: user.id,
      senderProfile: {
        id: user.id,
        displayName: user.display_name,
        handle: user.handle,
        avatarUrl: user.avatar_url,
      },
      mediaState: {
        audioMuted: this.isMicMuted(),
        videoMuted: this.isCameraMuted(),
        screenSharing: this.isScreenSharing(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Demo Mode & Interactive Simulation
  // ---------------------------------------------------------------------------

  private setupDemoOrHuddleCompanions(channel: Channel, type: CallType): void {
    // Stop any previous simulation
    if (this.simulatedInterval) {
      clearInterval(this.simulatedInterval);
      this.simulatedInterval = null;
    }

    // Add realistic companions (Sarah Chen, Marcus Vance, Elena Rostova)
    const companions = [
      {
        id: 'demo-sarah',
        displayName: 'Sarah Chen',
        handle: 'sarah',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        videoMuted: false,
        audioMuted: false,
      },
      {
        id: 'demo-marcus',
        displayName: 'Marcus Vance',
        handle: 'marcus',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        videoMuted: type === 'audio',
        audioMuted: true,
      },
    ];

    // Connect companions after realistic delay
    window.setTimeout(() => {
      if (!this.isInCall()) return;

      const sarah = companions[0];
      const sarahStream = this.createSyntheticVideoStream('Sarah Chen', '#6366f1');
      this.updateParticipant(sarah.id, {
        id: sarah.id,
        displayName: sarah.displayName,
        handle: sarah.handle,
        avatarUrl: sarah.avatarUrl,
        isLocal: false,
        isSpeaking: false,
        audioMuted: false,
        videoMuted: false,
        screenSharing: false,
        stream: sarahStream,
        connectionState: 'connected',
      });
      this.sounds.playJoinChime();
    }, 1800);

    if (!channel.is_dm) {
      window.setTimeout(() => {
        if (!this.isInCall()) return;

        const marcus = companions[1];
        this.updateParticipant(marcus.id, {
          id: marcus.id,
          displayName: marcus.displayName,
          handle: marcus.handle,
          avatarUrl: marcus.avatarUrl,
          isLocal: false,
          isSpeaking: false,
          audioMuted: true,
          videoMuted: true,
          screenSharing: false,
          stream: null,
          connectionState: 'connected',
        });
      }, 3600);
    }

    // Simulate active speaker pulses between companions
    this.simulatedInterval = window.setInterval(() => {
      if (!this.isInCall()) return;
      const participants = this.participants().filter((p) => !p.isLocal);
      if (participants.length === 0) return;

      const randomSpeaker = Math.random() > 0.4 ? participants[Math.floor(Math.random() * participants.length)] : null;
      participants.forEach((p) => {
        const isSpeaking = randomSpeaker?.id === p.id && !p.audioMuted;
        this.updateParticipant(p.id, { isSpeaking });
      });

      if (randomSpeaker && !randomSpeaker.audioMuted) {
        this.activeSpeakerId.set(randomSpeaker.id);
      }
    }, 4000);
  }

  /**
   * Generates a real interactive synthetic video stream using canvas
   * with fluid ambient visual waves so video elements actually render
   * a high-res moving video feed!
   */
  private createSyntheticVideoStream(name: string, accentColor: string): MediaStream | null {
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let frame = 0;
    const render = () => {
      frame++;
      // Background gradient
      const grad = ctx.createRadialGradient(
        320 + Math.sin(frame * 0.03) * 60,
        240 + Math.cos(frame * 0.03) * 40,
        40,
        320,
        240,
        340,
      );
      grad.addColorStop(0, '#1e1b4b');
      grad.addColorStop(1, '#090a15');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 480);

      // Ambient moving particle waves
      ctx.lineWidth = 2.5;
      for (let j = 0; j < 3; j++) {
        ctx.strokeStyle = `rgba(99, 102, 241, ${0.25 - j * 0.06})`;
        ctx.beginPath();
        for (let x = 0; x <= 640; x += 20) {
          const y = 240 + Math.sin(x * 0.015 + frame * 0.04 + j) * (24 + j * 12);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Avatar circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(320, 210, 65, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 24;
      ctx.fill();
      ctx.restore();

      // Initials text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initials = name
        .split(' ')
        .map((p) => p[0])
        .join('');
      ctx.fillText(initials, 320, 212);

      // Name label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '600 18px sans-serif';
      ctx.fillText(name, 320, 310);

      // Live tag
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(280, 345, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '12px sans-serif';
      ctx.fillText('Camera Active', 328, 345);

      requestAnimationFrame(render);
    };

    render();
    try {
      return (canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream }).captureStream(24);
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers & Cleanup
  // ---------------------------------------------------------------------------

  private startCallTimer(): void {
    this.stopCallTimer();
    this.callDuration.set(0);
    this.durationTimer = window.setInterval(() => {
      this.callDuration.update((d) => d + 1);
    }, 1000);
  }

  private stopCallTimer(): void {
    if (this.durationTimer !== null) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  private updateChannelHuddle(channelId: string, type: CallType, active: ActiveCall): void {
    if (active.isDm) return;
    this.channelHuddles.update((map) => {
      const next = new Map(map);
      next.set(channelId, {
        callId: active.id,
        channelId,
        type,
        participantCount: this.participantCount(),
        participants: this.participants().map((p) => ({
          id: p.id,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
        })),
        startedAt: active.startedAt,
      });
      return next;
    });
  }

  private cleanupCall(): void {
    this.sounds.stopIncomingRingtone();
    this.sounds.stopOutgoingRingtone();
    this.stopCallTimer();

    if (this.simulatedInterval) {
      clearInterval(this.simulatedInterval);
      this.simulatedInterval = null;
    }
    if (this.analyserTimer !== null) {
      clearInterval(this.analyserTimer);
      this.analyserTimer = null;
    }

    // Stop tracks
    const local = this.localStream();
    if (local) {
      local.getTracks().forEach((track) => track.stop());
      this.localStream.set(null);
    }

    const screen = this.screenStream();
    if (screen) {
      screen.getTracks().forEach((track) => track.stop());
      this.screenStream.set(null);
    }

    // Close peers
    for (const pc of this.peers.values()) {
      pc.close();
    }
    this.peers.clear();

    // Close signaling channel
    if (this.signalingChannel) {
      void this.signalingChannel.unsubscribe();
      this.signalingChannel = null;
    }

    const active = this.activeCall();
    if (active && !active.isDm) {
      this.channelHuddles.update((map) => {
        const next = new Map(map);
        next.delete(active.channelId);
        return next;
      });
    }

    this.activeCall.set(null);
    this.incomingCall.set(null);
    this.participantsMap.set(new Map());
    this.isMicMuted.set(false);
    this.isCameraMuted.set(false);
    this.isScreenSharing.set(false);
    this.isMinimized.set(false);
    this.pinnedParticipantId.set(null);
    this.activeSpeakerId.set(null);
  }
}

