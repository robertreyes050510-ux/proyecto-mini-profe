import type { StudentRuntimeConfig } from '@/features/teacher-config/types/student-runtime';

export type RealtimeConnectionBundle = {
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel;
  localStream: MediaStream;
  remoteAudio: HTMLAudioElement;
};

type CreateRealtimeConnectionInput = {
  runtime: StudentRuntimeConfig;
  deviceId: string;
  onRemoteTrack: () => void;
};

type SessionBrokerResponse = {
  answerSdp: string;
  callId: string | null;
  model: string;
  voice: string;
  expiresAt: string | null;
};

export async function createRealtimeConnection(
  input: CreateRealtimeConnectionInput,
) {
  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const peerConnection = new RTCPeerConnection();
  const remoteAudio = new Audio();
  remoteAudio.autoplay = true;
  remoteAudio.setAttribute('playsinline', 'true');

  const remoteStream = new MediaStream();

  peerConnection.ontrack = (event) => {
    for (const track of event.streams[0]?.getTracks() ?? []) {
      remoteStream.addTrack(track);
    }

    remoteAudio.srcObject = remoteStream;
    input.onRemoteTrack();
    void remoteAudio.play().catch(() => undefined);
  };

  for (const track of localStream.getTracks()) {
    peerConnection.addTrack(track, localStream);
  }

  const dataChannel = peerConnection.createDataChannel('oai-events');
  const offer = await peerConnection.createOffer({
    offerToReceiveAudio: true,
  });

  await peerConnection.setLocalDescription(offer);
  await waitForIceGatheringComplete(peerConnection);

  const sessionResponse = await fetch('/api/realtime/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deviceId: input.deviceId,
      runtime: input.runtime,
      offerSdp: peerConnection.localDescription?.sdp,
    }),
  });

  const payload = (await sessionResponse.json()) as
    | SessionBrokerResponse
    | {
        error?: string;
      };

  if (!sessionResponse.ok || !('answerSdp' in payload)) {
    const errorMessage = 'error' in payload ? payload.error : '';
    throw new Error(errorMessage || 'No se pudo iniciar la sesion Realtime.');
  }

  await peerConnection.setRemoteDescription({
    type: 'answer',
    sdp: payload.answerSdp,
  });

  return {
    bundle: {
      peerConnection,
      dataChannel,
      localStream,
      remoteAudio,
    },
    session: payload,
  };
}

async function waitForIceGatheringComplete(peerConnection: RTCPeerConnection) {
  if (peerConnection.iceGatheringState === 'complete') {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      peerConnection.removeEventListener('icegatheringstatechange', handleChange);
      resolve();
    }, 1_500);

    function handleChange() {
      if (peerConnection.iceGatheringState === 'complete') {
        window.clearTimeout(timeout);
        peerConnection.removeEventListener('icegatheringstatechange', handleChange);
        resolve();
      }
    }

    peerConnection.addEventListener('icegatheringstatechange', handleChange);
  });
}
