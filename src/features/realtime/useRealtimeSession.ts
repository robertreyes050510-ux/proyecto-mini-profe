'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRealtimeConnection } from '@/features/realtime/createRealtimeConnection';
import { parseRealtimeEvent } from '@/features/realtime/realtimeEvents';
import {
  getRealtimeHiddenPageTimeoutMs,
  getRealtimeSessionMaxMs,
} from '@/features/realtime/realtimeConfig';
import type { RealtimeStudentState } from '@/features/realtime/realtimeTypes';
import { useMicrophonePermission } from '@/features/realtime/useMicrophonePermission';
import type { StudentRuntimeConfig } from '@/features/teacher-config/types/student-runtime';

type SessionInfo = {
  callId: string | null;
  model: string;
  voice: string;
  expiresAt: string | null;
};

export function useRealtimeSession(runtime: StudentRuntimeConfig | null) {
  const [state, setState] = useState<RealtimeStudentState>('idle');
  const [error, setError] = useState('');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [assistantReply, setAssistantReply] = useState('');
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [connectionReady, setConnectionReady] = useState(false);
  const { permission, setPermission, probePermission } = useMicrophonePermission();
  const bundleRef = useRef<Awaited<ReturnType<typeof createRealtimeConnection>>['bundle'] | null>(
    null,
  );
  const sessionInfoRef = useRef<SessionInfo | null>(null);
  const activeResponseIdRef = useRef<string | null>(null);
  const hiddenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  useEffect(() => {
    sessionInfoRef.current = sessionInfo;
  }, [sessionInfo]);

  const endSession = useCallback(
    async (nextState: RealtimeStudentState = 'ended') => {
      if (hiddenTimeoutRef.current) {
        clearTimeout(hiddenTimeoutRef.current);
        hiddenTimeoutRef.current = null;
      }

      if (sessionEndTimeoutRef.current) {
        clearTimeout(sessionEndTimeoutRef.current);
        sessionEndTimeoutRef.current = null;
      }

      const currentBundle = bundleRef.current;
      const currentSession = sessionInfoRef.current;
      bundleRef.current = null;
      activeResponseIdRef.current = null;
      setConnectionReady(false);

      currentBundle?.dataChannel.close();
      currentBundle?.peerConnection.close();
      currentBundle?.remoteAudio.pause();
      currentBundle?.localStream.getTracks().forEach((track) => track.stop());

      if (currentSession) {
        void fetch('/api/realtime/session', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            callId: currentSession.callId,
            deviceId,
          }),
        }).catch(() => undefined);
      }

      setSessionInfo(null);
      setState(nextState);
    },
    [deviceId],
  );

  const sendRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    const channel = bundleRef.current?.dataChannel;

    if (!channel || channel.readyState !== 'open') {
      return;
    }

    channel.send(JSON.stringify(event));
  }, []);

  const cancelModelSpeech = useCallback(() => {
    const responseId = activeResponseIdRef.current;
    sendRealtimeEvent(
      responseId
        ? {
            type: 'response.cancel',
            response_id: responseId,
          }
        : {
            type: 'response.cancel',
          },
    );
    sendRealtimeEvent({
      type: 'output_audio_buffer.clear',
    });
  }, [sendRealtimeEvent]);

  const startSession = useCallback(async () => {
    if (!runtime || bundleRef.current) {
      return;
    }

    setError('');
    setPermissionMessage('');
    setLastTranscript('');
    setAssistantReply('');
    setState('requesting_permission');
    await probePermission();

    try {
      setState('connecting');
      const { bundle, session } = await createRealtimeConnection({
        runtime,
        deviceId,
        onRemoteTrack: () => {
          setConnectionReady(true);
        },
      });

      bundleRef.current = bundle;
      setSessionInfo(session);
      setPermission('granted');
      setConnectionReady(bundle.dataChannel.readyState === 'open');

      bundle.dataChannel.onopen = () => {
        setConnectionReady(true);
        setState('listening');
      };

      bundle.dataChannel.onerror = () => {
        setError('La sesion de audio tuvo un problema en tiempo real.');
        setState('error');
      };

      bundle.dataChannel.onmessage = (rawEvent) => {
        const event = parseRealtimeEvent(rawEvent);

        if (!event?.type) {
          return;
        }

        if (event.type === 'session.created') {
          setState('listening');
          return;
        }

        if (event.type === 'input_audio_buffer.speech_started') {
          if (activeResponseIdRef.current) {
            cancelModelSpeech();
          }
          setState('user_speaking');
          return;
        }

        if (event.type === 'input_audio_buffer.speech_stopped') {
          setState('model_processing');
          return;
        }

        if (event.type === 'conversation.item.input_audio_transcription.completed') {
          setLastTranscript(event.transcript || '');
          return;
        }

        if (event.type === 'response.created') {
          activeResponseIdRef.current = event.response?.id || event.response_id || null;
          setState('model_processing');
          return;
        }

        if (event.type === 'response.output_audio.delta') {
          setState('model_speaking');
          return;
        }

        if (event.type === 'response.output_audio_transcript.delta') {
          setAssistantReply((current) => `${current}${event.delta || ''}`);
          setState('model_speaking');
          return;
        }

        if (event.type === 'response.output_audio_transcript.done') {
          setAssistantReply(event.transcript || '');
          return;
        }

        if (event.type === 'response.done') {
          activeResponseIdRef.current = null;
          setState('listening');
          return;
        }

        if (event.type === 'error') {
          setError(event.error?.message || 'La sesion realtime devolvio un error.');
          setState('error');
        }
      };

      bundle.peerConnection.onconnectionstatechange = () => {
        const connectionState = bundle.peerConnection.connectionState;

        if (connectionState === 'failed' || connectionState === 'disconnected') {
          setState('reconnecting');
        }

        if (connectionState === 'closed') {
          void endSession('ended');
        }
      };

      sessionEndTimeoutRef.current = setTimeout(() => {
        void endSession('ended');
      }, getRealtimeSessionMaxMs());
    } catch (sessionError) {
      if (
        sessionError instanceof DOMException &&
        (sessionError.name === 'NotAllowedError' || sessionError.name === 'PermissionDeniedError')
      ) {
        setPermission('denied');
        setPermissionMessage('El navegador no recibio permiso de microfono.');
      }

      setError(
        sessionError instanceof Error
          ? sessionError.message
          : 'No se pudo iniciar la sesion realtime.',
      );
      setState('error');
    }
  }, [
    cancelModelSpeech,
    deviceId,
    endSession,
    probePermission,
    runtime,
    setPermission,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenTimeoutRef.current = setTimeout(() => {
          void endSession('ended');
        }, getRealtimeHiddenPageTimeoutMs());
        return;
      }

      if (hiddenTimeoutRef.current) {
        clearTimeout(hiddenTimeoutRef.current);
        hiddenTimeoutRef.current = null;
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [endSession]);

  useEffect(() => {
    return () => {
      void endSession('ended');
    };
  }, [endSession]);

  return {
    state,
    error,
    permission,
    permissionMessage,
    lastTranscript,
    assistantReply,
    sessionInfo,
    connectionReady,
    startSession,
    endSession,
  };
}

function getOrCreateDeviceId() {
  if (typeof window === 'undefined') {
    return 'server-preview-device';
  }

  const storageKey = 'mini-profe-device-id';
  const existing = window.localStorage.getItem(storageKey);

  if (existing) {
    return existing;
  }

  const nextId = `device-${crypto.randomUUID()}`;
  window.localStorage.setItem(storageKey, nextId);
  return nextId;
}
