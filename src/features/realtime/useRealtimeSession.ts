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

const ACTIVE_WAKE_WINDOW_MS = 25_000;

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
  const ignoredResponseIdRef = useRef<string | null>(null);
  const suppressNextResponseRef = useRef(false);
  const wakeUnlockedRef = useRef(false);
  const wakeWindowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  useEffect(() => {
    sessionInfoRef.current = sessionInfo;
  }, [sessionInfo]);

  const endSession = useCallback(
    async (nextState: RealtimeStudentState = 'ended') => {
      if (wakeWindowTimeoutRef.current) {
        clearTimeout(wakeWindowTimeoutRef.current);
        wakeWindowTimeoutRef.current = null;
      }

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
      ignoredResponseIdRef.current = null;
      suppressNextResponseRef.current = false;
      wakeUnlockedRef.current = false;
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

  const clearWakeWindow = useCallback(() => {
    if (wakeWindowTimeoutRef.current) {
      clearTimeout(wakeWindowTimeoutRef.current);
      wakeWindowTimeoutRef.current = null;
    }
  }, []);

  const relockWakeSession = useCallback(
    (message?: string) => {
      clearWakeWindow();
      wakeUnlockedRef.current = false;
      suppressNextResponseRef.current = false;
      ignoredResponseIdRef.current = null;
      activeResponseIdRef.current = null;
      setState('awaiting_wake');

      if (message) {
        setAssistantReply(message);
      }
    },
    [clearWakeWindow],
  );

  const armWakeWindow = useCallback(
    (wakePhrase: string) => {
      clearWakeWindow();
      wakeWindowTimeoutRef.current = setTimeout(() => {
        relockWakeSession(
          `Sesion en pausa por silencio. Di "${wakePhrase}" para volver a activarla.`,
        );
      }, ACTIVE_WAKE_WINDOW_MS);
    },
    [clearWakeWindow, relockWakeSession],
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
    wakeUnlockedRef.current = false;
    suppressNextResponseRef.current = false;
    ignoredResponseIdRef.current = null;
    clearWakeWindow();
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
        setState('awaiting_wake');
        setAssistantReply(
          `Esperando activacion: di "${runtime.activeCharacter.wakePhrase}".`,
        );
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
          setState('awaiting_wake');
          return;
        }

        if (event.type === 'input_audio_buffer.speech_started') {
          clearWakeWindow();
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
          const transcript = event.transcript || '';

          if (!wakeUnlockedRef.current) {
            setLastTranscript(transcript);
            const wakeResult = processRealtimeWakeTranscript({
              transcript,
              wakePhrase: runtime.activeCharacter.wakePhrase,
              characterName: runtime.activeCharacter.name,
              wakeAliases: runtime.activeCharacter.wakeAliases ?? [],
            });

            if (wakeResult.kind === 'rejected') {
              suppressNextResponseRef.current = true;
              setAssistantReply(wakeResult.prompt);
              setState('awaiting_wake');
              return;
            }

            if (wakeResult.kind === 'activation_only') {
              wakeUnlockedRef.current = true;
              suppressNextResponseRef.current = true;
              setAssistantReply(wakeResult.prompt);
              setState('listening');
              armWakeWindow(runtime.activeCharacter.wakePhrase);
              return;
            }

            wakeUnlockedRef.current = true;
            setLastTranscript(wakeResult.question);
            setAssistantReply(wakeResult.prompt);
            armWakeWindow(runtime.activeCharacter.wakePhrase);
            return;
          }

          const stopResult = processRealtimeStopTranscript({
            transcript,
            characterName: runtime.activeCharacter.name,
            wakeAliases: runtime.activeCharacter.wakeAliases ?? [],
          });

          if (stopResult.kind === 'stop') {
            suppressNextResponseRef.current = true;
            setLastTranscript(transcript);
            relockWakeSession(stopResult.prompt);
            return;
          }

          setLastTranscript(transcript);
          armWakeWindow(runtime.activeCharacter.wakePhrase);
          return;
        }

        if (event.type === 'response.created') {
          const responseId = event.response?.id || event.response_id || null;
          activeResponseIdRef.current = responseId;

          if (suppressNextResponseRef.current && responseId) {
            ignoredResponseIdRef.current = responseId;
            suppressNextResponseRef.current = false;
            cancelModelSpeech();
            setState(wakeUnlockedRef.current ? 'listening' : 'awaiting_wake');
            return;
          }

          setState('model_processing');
          return;
        }

        if (event.type === 'response.output_audio.delta') {
          if (ignoredResponseIdRef.current) {
            return;
          }
          clearWakeWindow();
          setState('model_speaking');
          return;
        }

        if (event.type === 'response.output_audio_transcript.delta') {
          if (ignoredResponseIdRef.current) {
            return;
          }
          setAssistantReply((current) => `${current}${event.delta || ''}`);
          setState('model_speaking');
          return;
        }

        if (event.type === 'response.output_audio_transcript.done') {
          if (ignoredResponseIdRef.current) {
            return;
          }
          setAssistantReply(event.transcript || '');
          return;
        }

        if (event.type === 'response.done') {
          if (
            ignoredResponseIdRef.current &&
            (event.response_id === ignoredResponseIdRef.current ||
              event.response?.id === ignoredResponseIdRef.current ||
              !event.response_id)
          ) {
            ignoredResponseIdRef.current = null;
            activeResponseIdRef.current = null;
            armWakeWindow(runtime.activeCharacter.wakePhrase);
            setState(wakeUnlockedRef.current ? 'listening' : 'awaiting_wake');
            return;
          }

          activeResponseIdRef.current = null;
          if (wakeUnlockedRef.current) {
            armWakeWindow(runtime.activeCharacter.wakePhrase);
          }
          setState('listening');
          return;
        }

        if (event.type === 'error') {
          const message = event.error?.message || 'La sesion realtime devolvio un error.';

          if (message === 'Cancellation failed: no active response found') {
            return;
          }

          setError(message);
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
    clearWakeWindow,
    deviceId,
    endSession,
    probePermission,
    relockWakeSession,
    runtime,
    setPermission,
    armWakeWindow,
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

function processRealtimeWakeTranscript(input: {
  transcript: string;
  wakePhrase: string;
  characterName: string;
  wakeAliases: string[];
}) {
  const rawTranscript = input.transcript.trim();
  const normalizedTranscript = normalizeSpeechText(rawTranscript);
  const normalizedWakePhrase = normalizeSpeechText(input.wakePhrase);
  const normalizedName = normalizeSpeechText(input.characterName);
  const normalizedAliases = input.wakeAliases
    .map(normalizeSpeechText)
    .filter(Boolean);
  const openingCues = buildOpeningCues(
    normalizedWakePhrase,
    normalizedName,
    normalizedAliases,
  );
  const openingCue = findMatchingCue(normalizedTranscript, openingCues);

  if (!openingCue) {
    return {
      kind: 'rejected' as const,
      prompt: `Para empezar, di "${input.wakePhrase}".`,
    };
  }

  const remainder = stripWakeCue(normalizedTranscript, openingCue);

  if (!remainder) {
    return {
      kind: 'activation_only' as const,
      prompt: `Sesion abierta con "${input.wakePhrase}". Ahora si te escucho.`,
    };
  }

  return {
    kind: 'question' as const,
    question: remainder,
    prompt: `Sesion abierta con "${input.wakePhrase}".`,
  };
}

function processRealtimeStopTranscript(input: {
  transcript: string;
  characterName: string;
  wakeAliases: string[];
}) {
  const normalizedTranscript = normalizeSpeechText(input.transcript);
  const normalizedName = normalizeSpeechText(input.characterName);
  const normalizedAliases = input.wakeAliases
    .map(normalizeSpeechText)
    .filter(Boolean);
  const stopPhrases = buildStopCues(normalizedName, normalizedAliases);

  if (!stopPhrases.some((cue) => normalizedTranscript === cue)) {
    return {
      kind: 'continue' as const,
    };
  }

  return {
    kind: 'stop' as const,
    prompt: `Peluche en reposo. Para volver a empezar, di "Hola ${input.characterName}".`,
  };
}

function normalizeSpeechText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[!?.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMatchingCue(transcript: string, cues: string[]) {
  return cues.find((cue) => transcript === cue || transcript.startsWith(`${cue} `));
}

function buildOpeningCues(
  normalizedWakePhrase: string,
  normalizedName: string,
  normalizedAliases: string[],
) {
  const cues = new Set<string>([normalizedWakePhrase]);

  if (normalizedName) {
    cues.add(`hola ${normalizedName}`);
  }

  for (const alias of normalizedAliases) {
    cues.add(alias);
    cues.add(`hola ${alias}`);
  }

  return Array.from(cues).filter(Boolean);
}

function buildStopCues(normalizedName: string, normalizedAliases: string[]) {
  const names = [normalizedName, ...normalizedAliases].filter(Boolean);
  const genericCues = [
    'para',
    'parate',
    'detente',
    'alto',
    'descansa',
    'duermete',
    'a dormir',
    'vete a dormir',
  ];
  const cues = new Set<string>(genericCues);

  for (const name of names) {
    cues.add(`adios ${name}`);
    cues.add(`hasta luego ${name}`);
    cues.add(`${name} para`);
    cues.add(`${name} descansa`);
    cues.add(`${name} duermete`);
    cues.add(`${name} a dormir`);
  }

  return Array.from(cues);
}

function stripWakeCue(transcript: string, cue: string) {
  if (transcript === cue) {
    return '';
  }

  return transcript.startsWith(`${cue} `)
    ? transcript.slice(cue.length).trim()
    : transcript;
}
