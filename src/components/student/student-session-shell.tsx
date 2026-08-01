'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConversationApiRequest,
  ConversationStatus,
  ConversationTurnResult,
} from '@/features/conversation/types/conversation';
import { getPublishedStudentRuntimeConfig } from '@/features/teacher-config/services/student-runtime-service';
import type { TeacherCharacterRecord } from '@/features/teacher-config/types/character';
import type { TeacherLessonRecord } from '@/features/teacher-config/types/lesson';

type SessionStatus = 'booting' | 'ready' | 'missing-config' | 'error';
type WakeSessionState = 'locked' | 'active';
type SpeechRecognitionInstance = {
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: null | (() => void);
  onerror: null | ((event: { error?: string }) => void);
  onresult:
    | null
    | ((event: {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{
            transcript: string;
          }>
        >;
      }) => void);
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
type BrowserSpeechSynthesis = SpeechSynthesis;
type ProcessedTranscriptResult =
  | { kind: 'activation_only'; prompt: string }
  | { kind: 'question'; prompt: string; question: string }
  | { kind: 'rejected'; prompt: string };

const ACTIVE_SESSION_WINDOW_MS = 60_000;
const MAX_LISTENING_WINDOW_MS = 8_500;
const SILENCE_GRACE_WINDOW_MS = 2_200;

const states: Array<{
  label: string;
  description: string;
  phase: ConversationStatus;
}> = [
  {
    label: 'En espera',
    description: 'El personaje esta listo para activarse con la palabra clave o un gesto.',
    phase: 'idle',
  },
  {
    label: 'Despertando',
    description: 'La palabra de activacion fue valida y el peluche abrio la sesion.',
    phase: 'wake_detected',
  },
  {
    label: 'Escuchando',
    description: 'Captura la voz del estudiante y prepara la transcripcion.',
    phase: 'listening',
  },
  {
    label: 'Transcribiendo',
    description: 'Convierte la voz en texto para preparar el siguiente turno.',
    phase: 'transcribing',
  },
  {
    label: 'Pensando',
    description: 'Aplica reglas pedagogicas y consulta a OpenAI desde el servidor.',
    phase: 'thinking',
  },
  {
    label: 'Hablando',
    description: 'Reproduce la respuesta del peluche con voz natural.',
    phase: 'speaking',
  },
];

export function StudentSessionShell() {
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [character, setCharacter] = useState<TeacherCharacterRecord | null>(null);
  const [lesson, setLesson] = useState<TeacherLessonRecord | null>(null);
  const [message, setMessage] = useState('Preparando la sesion del peluche...');
  const [conversationStatus, setConversationStatus] =
    useState<ConversationStatus>('idle');
  const [wakeSessionState, setWakeSessionState] =
    useState<WakeSessionState>('locked');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voicePlaybackSupported, setVoicePlaybackSupported] = useState(false);
  const [speechBusy, setSpeechBusy] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastAcceptedPrompt, setLastAcceptedPrompt] = useState('');
  const [assistantReply, setAssistantReply] = useState('');
  const [assistantMeta, setAssistantMeta] = useState<ConversationTurnResult | null>(null);
  const [assistantError, setAssistantError] = useState('');
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState<number>(0);
  const transcriptBufferRef = useRef('');
  const speechBusyRef = useRef(false);
  const recognitionRef = useRef<null | SpeechRecognitionInstance>(null);
  const stopRequestedRef = useRef(false);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxListeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeSessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const speechSynthesisRef = useRef<BrowserSpeechSynthesis | null>(null);
  const lastSpokenReplyRef = useRef('');

  useEffect(() => {
    speechBusyRef.current = speechBusy;
  }, [speechBusy]);

  const playAssistantReply = useCallback(
    (text: string) => {
      if (typeof window === 'undefined') {
        return false;
      }

      const synthesis =
        speechSynthesisRef.current ?? window.speechSynthesis ?? null;

      if (!synthesis || !text.trim()) {
        return false;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-US';
      utterance.rate = character?.voiceSpeed ?? 1;

      const preferredVoice = pickPreferredVoice(
        synthesis.getVoices(),
        character?.voiceId,
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang || utterance.lang;
      }

      utterance.onstart = () => {
        setConversationStatus('speaking');
        setMessage('El peluche esta reproduciendo la respuesta en voz natural.');
      };

      utterance.onend = () => {
        setMessage(
          wakeSessionState === 'active'
            ? 'Respuesta terminada. La sesion sigue abierta para el siguiente turno.'
            : 'Respuesta terminada. Puedes volver a activar al peluche cuando quieras.',
        );
      };

      utterance.onerror = () => {
        setAssistantError(
          'La respuesta se genero, pero la voz del navegador no pudo reproducirse.',
        );
        setMessage(
          'La respuesta del peluche esta lista en texto, pero fallo la reproduccion por voz.',
        );
      };

      synthesis.cancel();
      synthesis.speak(utterance);
      lastSpokenReplyRef.current = text;
      return true;
    },
    [character?.voiceId, character?.voiceSpeed, wakeSessionState],
  );

  const resetWakeSession = useCallback(
    (reason?: string) => {
      if (wakeSessionTimeoutRef.current) {
        clearTimeout(wakeSessionTimeoutRef.current);
        wakeSessionTimeoutRef.current = null;
      }

      if (sessionCountdownIntervalRef.current) {
        clearInterval(sessionCountdownIntervalRef.current);
        sessionCountdownIntervalRef.current = null;
      }

      setWakeSessionState('locked');
      setSessionSecondsLeft(0);
      setConversationStatus('idle');

      if (reason) {
        setMessage(reason);
      }
    },
    [],
  );

  const armWakeSessionWindow = useCallback(
    (characterName: string) => {
      const nextExpiresAt = Date.now() + ACTIVE_SESSION_WINDOW_MS;

      if (wakeSessionTimeoutRef.current) {
        clearTimeout(wakeSessionTimeoutRef.current);
      }

      if (sessionCountdownIntervalRef.current) {
        clearInterval(sessionCountdownIntervalRef.current);
      }

      setWakeSessionState('active');
      setSessionSecondsLeft(Math.ceil(ACTIVE_SESSION_WINDOW_MS / 1000));

      wakeSessionTimeoutRef.current = setTimeout(() => {
        resetWakeSession(
          `La sesion activa expiró. Para volver a empezar, di "Hola ${characterName}".`,
        );
      }, ACTIVE_SESSION_WINDOW_MS);

      sessionCountdownIntervalRef.current = setInterval(() => {
        const secondsLeft = Math.max(
          0,
          Math.ceil((nextExpiresAt - Date.now()) / 1000),
        );
        setSessionSecondsLeft(secondsLeft);

        if (secondsLeft <= 0 && sessionCountdownIntervalRef.current) {
          clearInterval(sessionCountdownIntervalRef.current);
          sessionCountdownIntervalRef.current = null;
        }
      }, 250);
    },
    [resetWakeSession],
  );

  const loadStudentSession = useCallback(async () => {
    setStatus('booting');
    setMessage('Cargando configuracion publica del peluche...');

    try {
      const runtimeConfig = await getPublishedStudentRuntimeConfig();

      if (!runtimeConfig) {
        setStatus('missing-config');
        setCharacter(null);
        setLesson(null);
        setMessage(
          'Todavia no hay una configuracion publicada para el peluche. Guarda la configuracion activa desde el panel del profesor.',
        );
        return;
      }

      setCharacter(runtimeConfig.activeCharacter);
      setLesson(runtimeConfig.activeLesson);
      setAssistantReply('');
      setAssistantMeta(null);
      setAssistantError('');
      setStatus('ready');
      resetWakeSession(
        `La sesion publica del peluche ya esta lista. Empieza diciendo "${runtimeConfig.activeCharacter.wakePhrase}".`,
      );
    } catch (error) {
      setStatus('error');
      setCharacter(null);
      setLesson(null);
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar la configuracion del estudiante.',
      );
    }
  }, [resetWakeSession]);

  useEffect(() => {
    void loadStudentSession();
  }, [loadStudentSession]);

  async function handleVoiceTap() {
    if (status !== 'ready') {
      return;
    }

    const recognition = recognitionRef.current;

    if (!recognition) {
      setSpeechError(
        'Este navegador no soporta reconocimiento de voz web. Necesitaremos otro entorno o un motor de STT distinto.',
      );
      setConversationStatus('error');
      return;
    }

    if (speechBusy) {
      stopRequestedRef.current = true;
      safeStopRecognition();
      setConversationStatus('transcribing');
      setMessage('Terminando escucha y cerrando la transcripcion...');
      return;
    }

    setSpeechError('');
    setLiveTranscript('');
    transcriptBufferRef.current = '';
    setSpeechBusy(true);
    setConversationStatus('listening');
    setMessage(
      wakeSessionState === 'locked'
        ? `Escuchando activacion. Empieza con "${character?.wakePhrase ?? 'Hola'}".`
        : `Escuchando seguimiento. Como la sesion ya esta abierta, ahora basta con decir "${character?.name ?? 'el nombre'}".`,
    );
    scheduleMaxListeningStop();

    try {
      recognition.start();
    } catch (error) {
      setSpeechBusy(false);
      setConversationStatus('error');
      setSpeechError(
        error instanceof Error
          ? error.message
          : 'No se pudo iniciar el reconocimiento de voz.',
      );
    }
  }

  function clearListeningTimers() {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (maxListeningTimeoutRef.current) {
      clearTimeout(maxListeningTimeoutRef.current);
      maxListeningTimeoutRef.current = null;
    }
  }

  function scheduleMaxListeningStop() {
    if (maxListeningTimeoutRef.current) {
      clearTimeout(maxListeningTimeoutRef.current);
    }

    maxListeningTimeoutRef.current = setTimeout(() => {
      stopRequestedRef.current = true;
      safeStopRecognition();
      setConversationStatus('transcribing');
      setMessage('Cerrando la escucha para procesar la transcripcion...');
    }, MAX_LISTENING_WINDOW_MS);
  }

  function safeStopRecognition() {
    try {
      recognitionRef.current?.stop();
    } catch {
      recognitionRef.current?.abort();
    }
  }

  const requestAssistantReply = useCallback(
    async (studentTranscript: string) => {
      if (!character || !lesson) {
        throw new Error('Falta la configuracion activa del peluche.');
      }

      const payload: ConversationApiRequest = {
        studentTranscript,
        activeCharacter: {
          name: character.name,
          personality: character.personality,
          wakePhrase: character.wakePhrase,
          wakeAliases: character.wakeAliases ?? [],
        },
        activeLesson: {
          topic: lesson.topic,
          gradeLevel: lesson.gradeLevel,
          objective: lesson.objective,
          allowedVocabulary: lesson.allowedVocabulary,
          supportPhrases: lesson.supportPhrases ?? [],
          responseMode: lesson.responseMode ?? 'strict',
          freedomLevel: lesson.freedomLevel ?? 'low',
          maxResponseSentences: lesson.maxResponseSentences,
          maxQuestionsPerTurn: lesson.maxQuestionsPerTurn,
          englishFallbackText: lesson.englishFallbackText,
        },
      };

      const response = await fetch('/api/conversation/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        error?: string;
        result?: ConversationTurnResult;
      };

      if (!response.ok || !data.result) {
        throw new Error(
          data.error || 'No se pudo generar la respuesta del peluche.',
        );
      }

      return data.result;
    },
    [character, lesson],
  );

  const handleProcessedTranscript = useCallback(
    async (finalTranscript: string) => {
      const nextCharacterName = character?.name?.trim() ?? 'Peluche';
      const wakePhrase = character?.wakePhrase?.trim() || `Hola ${nextCharacterName}`;
      const wakeAliases = character?.wakeAliases ?? [];
      const processedResult = processStudentTranscript({
        transcript: finalTranscript,
        wakePhrase,
        characterName: nextCharacterName,
        wakeAliases,
        wakeSessionState,
      });

      setLastTranscript(finalTranscript);

      if (processedResult.kind === 'rejected') {
        setLastAcceptedPrompt('');
        setAssistantError('');
        resetWakeSession(processedResult.prompt);
        return;
      }

      armWakeSessionWindow(nextCharacterName);
      setLastAcceptedPrompt(processedResult.prompt);

      if (processedResult.kind === 'activation_only') {
        setAssistantError('');
        setConversationStatus('wake_detected');
        setMessage(processedResult.prompt);
        return;
      }

      setConversationStatus('thinking');
      setMessage(processedResult.prompt);
      setLastTranscript(processedResult.question);

      try {
        setAssistantError('');
        const reply = await requestAssistantReply(processedResult.question);
        setAssistantMeta(reply);
        setAssistantReply(reply.text);
        setConversationStatus('speaking');
        setMessage('La respuesta del peluche ya esta lista. Preparando la voz...');
        const played = playAssistantReply(reply.text);

        if (!played) {
          setMessage(
            'La respuesta del peluche ya esta lista en texto. Este navegador no tiene voz disponible.',
          );
        }
      } catch (error) {
        setAssistantMeta(null);
        setAssistantReply('');
        setConversationStatus('error');
        setAssistantError(
          error instanceof Error
            ? error.message
            : 'No se pudo generar la respuesta del peluche.',
        );
        setMessage(
          'La transcripcion fue valida, pero fallo la generacion de la respuesta.',
        );
      }
    },
    [
      armWakeSessionWindow,
      character?.name,
      character?.wakeAliases,
      character?.wakePhrase,
      playAssistantReply,
      requestAssistantReply,
      resetWakeSession,
      wakeSessionState,
    ],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    speechSynthesisRef.current = window.speechSynthesis ?? null;
    setVoicePlaybackSupported(Boolean(window.speechSynthesis));

    const recognitionCtor = getSpeechRecognitionConstructor();

    if (!recognitionCtor) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new recognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'es-US';

    const scheduleAutoStop = () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }

      silenceTimeoutRef.current = setTimeout(() => {
        if (speechBusyRef.current || recognitionRef.current) {
          stopRequestedRef.current = true;
          safeStopRecognition();
          setConversationStatus('transcribing');
          setMessage('Cerrando la transcripcion despues de detectar una pausa...');
        }
      }, SILENCE_GRACE_WINDOW_MS);
    };

    recognition.onresult = (event) => {
      const transcript = extractTranscript(event);
      transcriptBufferRef.current = transcript;
      setLiveTranscript(transcript);
      setConversationStatus('transcribing');
      scheduleAutoStop();
    };

    recognition.onerror = (event) => {
      const nextMessage = mapSpeechError(event.error);
      setSpeechError(nextMessage);
      setSpeechBusy(false);
      setConversationStatus('error');
      setMessage(nextMessage);
    };

    recognition.onend = () => {
      clearListeningTimers();

      if (stopRequestedRef.current) {
        stopRequestedRef.current = false;
      }

      setSpeechBusy(false);
      const finalTranscript = transcriptBufferRef.current.trim();

      if (finalTranscript) {
        handleProcessedTranscript(finalTranscript);
        setLiveTranscript('');
        transcriptBufferRef.current = '';
        return;
      }

      setConversationStatus('idle');
      setMessage(
        'No se detecto voz clara en esta prueba. Intenta de nuevo con una frase corta en espanol.',
      );
    };

    recognitionRef.current = recognition;
    setSpeechSupported(true);

    return () => {
      clearListeningTimers();
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.abort();
      window.speechSynthesis?.cancel();
      recognitionRef.current = null;
      resetWakeSession();
    };
  }, [handleProcessedTranscript, resetWakeSession]);

  const visibleTranscript = liveTranscript || lastTranscript;
  const currentStateLabel = getConversationLabel(status, conversationStatus);
  const wakeInstruction =
    wakeSessionState === 'locked'
      ? `Di "${character?.wakePhrase ?? 'Hola Peluche'}" para abrir la sesion.`
      : `La sesion sigue abierta. Durante ${sessionSecondsLeft} s basta con decir "${character?.name ?? 'el nombre'}".`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fffdf8] via-[#eef9ff] to-[#dff4ff] px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="grid gap-8 rounded-[2rem] bg-white/80 p-8 shadow-card backdrop-blur lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <span className="inline-flex rounded-full bg-mint px-4 py-2 text-sm font-bold uppercase tracking-[0.2em] text-ink">
              Modo estudiante
            </span>
            <div className="space-y-4">
              <h1 className="text-4xl font-extrabold md:text-5xl">
                Interfaz del peluche con configuracion activa del profesor.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-ink/75">
                Esta pantalla ya no es solo una maqueta: ahora carga el personaje y
                la leccion activos para preparar el siguiente paso, que sera el
                flujo real de voz.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {states.map((state) => (
                <article
                  key={state.label}
                  className={`rounded-[1.5rem] border p-5 ${
                    conversationStatus === state.phase
                      ? 'border-coral bg-[#fff1eb]'
                      : 'border-ink/10 bg-[#fdfcf8]'
                  }`}
                >
                  <h2 className="text-lg font-extrabold">{state.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-ink/70">
                    {state.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="flex w-full max-w-md flex-col items-center rounded-[2rem] bg-ink p-8 text-center text-white shadow-card">
              <div className="mb-6 flex h-44 w-44 items-center justify-center rounded-full bg-sky/20">
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-coral px-4 text-3xl font-extrabold">
                  {character?.name ?? 'Peluche'}
                </div>
              </div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-sky">
                Estado actual
              </p>
              <h2 className="mt-2 text-3xl font-extrabold">{currentStateLabel}</h2>
              <p className="mt-4 max-w-xs text-base leading-7 text-white/75">
                {message}
              </p>
              {speechError ? (
                <p className="mt-5 rounded-2xl bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b84e28]">
                  {speechError}
                </p>
              ) : null}
              {assistantError ? (
                <p className="mt-3 rounded-2xl bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b84e28]">
                  {assistantError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleVoiceTap()}
                disabled={status !== 'ready' || !speechSupported}
                className="mt-8 rounded-full bg-coral px-6 py-3 font-bold text-white disabled:opacity-50"
              >
                {status !== 'ready'
                  ? 'Esperando configuracion'
                  : !speechSupported
                    ? 'Voz no disponible en este navegador'
                    : speechBusy
                      ? 'Detener escucha'
                      : wakeSessionState === 'locked'
                        ? 'Escuchar Hola + nombre'
                      : 'Escuchar nombre o pregunta'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssistantError('');
                  const played = playAssistantReply(assistantReply);
                  if (!played) {
                    setAssistantError(
                      'No hay una respuesta de voz lista o este navegador no permite reproducirla.',
                    );
                  }
                }}
                disabled={!voicePlaybackSupported || !assistantReply}
                className="mt-3 rounded-full border border-white/20 px-6 py-3 font-bold text-white disabled:opacity-50"
              >
                Repetir respuesta
              </button>
              <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">
                {wakeInstruction}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] bg-white p-8 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              Personaje activo
            </p>
            <div className="mt-6 space-y-4">
              <div className="rounded-[1.5rem] border border-ink/10 p-5">
                <p className="text-sm font-bold text-ink/55">Estado de sesion</p>
                <p className="mt-2 text-2xl font-extrabold">
                  {wakeSessionState === 'locked' ? 'Reposo' : 'Sesion activa'}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink/65">
                  {wakeSessionState === 'locked'
                    ? 'Todavia requiere la frase completa de inicio.'
                    : `La sesion ya esta abierta y vence en ${sessionSecondsLeft} segundos.`}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 p-5">
                <p className="text-sm font-bold text-ink/55">Nombre</p>
                <p className="mt-2 text-2xl font-extrabold">
                  {character?.name ?? 'Sin seleccionar'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 p-5">
                <p className="text-sm font-bold text-ink/55">Frase de activacion</p>
                <p className="mt-2 text-2xl font-extrabold text-coral">
                  {character?.wakePhrase ?? 'Sin configurar'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 p-5">
                <p className="text-sm font-bold text-ink/55">Personalidad</p>
                <p className="mt-2 text-base leading-7 text-ink/75">
                  {character?.personality ?? 'Sin configurar'}
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-8 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              Leccion activa
            </p>
            <div className="mt-6 space-y-4">
              <div className="rounded-[1.5rem] border border-ink/10 p-5">
                <p className="text-sm font-bold text-ink/55">Tema</p>
                <p className="mt-2 text-2xl font-extrabold">
                  {lesson?.topic ?? 'Sin seleccionar'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 p-5">
                <p className="text-sm font-bold text-ink/55">Nivel</p>
                <p className="mt-2 text-2xl font-extrabold">
                  {lesson?.gradeLevel ?? 'Sin seleccionar'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 p-5">
                <p className="text-sm font-bold text-ink/55">Objetivo</p>
                <p className="mt-2 text-base leading-7 text-ink/75">
                  {lesson?.objective ?? 'Sin configurar'}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-ink/10 p-5">
                  <p className="text-sm font-bold text-ink/55">Modo</p>
                  <p className="mt-2 text-xl font-extrabold">
                    {formatResponseMode(lesson?.responseMode)}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-ink/10 p-5">
                  <p className="text-sm font-bold text-ink/55">Libertad</p>
                  <p className="mt-2 text-xl font-extrabold">
                    {formatFreedomLevel(lesson?.freedomLevel)}
                  </p>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 p-5">
                <p className="text-sm font-bold text-ink/55">Vocabulario permitido</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lesson?.allowedVocabulary?.length ? (
                    lesson.allowedVocabulary.map((word) => (
                      <span
                        key={word}
                        className="rounded-full bg-[#fff1eb] px-3 py-1 text-sm font-bold text-coral"
                      >
                        {word}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-ink/60">Sin configurar</span>
                  )}
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 p-5">
                <p className="text-sm font-bold text-ink/55">Frases de apoyo</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lesson?.supportPhrases?.length ? (
                    lesson.supportPhrases.map((phrase) => (
                      <span
                        key={phrase}
                        className="rounded-full bg-[#eef9ff] px-3 py-1 text-sm font-bold text-[#2d6d96]"
                      >
                        {phrase}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-ink/60">Sin configurar</span>
                  )}
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] bg-white p-8 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              Captura de voz
            </p>
            <h2 className="mt-4 text-3xl font-extrabold">
              Transcripcion del ultimo intento
            </h2>
            <div className="mt-6 rounded-[1.5rem] border border-ink/10 bg-[#fcfdfd] p-5">
              <p className="text-sm font-bold text-ink/55">Texto aceptado</p>
              <p className="mt-3 text-lg leading-8 text-ink/80">
                {visibleTranscript || 'Todavia no hay transcripcion.'}
              </p>
            </div>
            <div className="mt-4 rounded-[1.5rem] border border-ink/10 bg-[#fcfdfd] p-5">
              <p className="text-sm font-bold text-ink/55">Regla aplicada</p>
              <p className="mt-3 text-base leading-7 text-ink/75">
                {lastAcceptedPrompt || 'Todavia no se ha validado una activacion.'}
              </p>
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-8 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              Respuesta del peluche
            </p>
            <h2 className="mt-4 text-3xl font-extrabold">
              Respuesta generada para el alumno
            </h2>
            <p className="mt-4 text-base leading-7 text-ink/70">
              Esta tarjeta muestra el texto que genero OpenAI siguiendo las
              reglas del personaje y de la leccion. Si el navegador lo permite,
              el peluche tambien lo reproduce con voz natural.
            </p>
            <div className="mt-6 rounded-[1.5rem] bg-[#f8fbff] p-5">
              <p className="text-sm font-bold text-ink/55">Texto final</p>
              <p className="mt-2 text-base leading-7 text-ink/75">
                {assistantReply || 'Todavia no hay respuesta generada.'}
              </p>
            </div>
            <div className="mt-4 rounded-[1.5rem] border border-ink/10 bg-[#fcfdfd] p-5">
              <p className="text-sm font-bold text-ink/55">Control aplicado</p>
              <p className="mt-2 text-sm leading-6 text-ink/70">
                {assistantMeta
                  ? [
                      `Idioma detectado: ${formatDetectedLanguage(assistantMeta.detectedLanguage)}`,
                      assistantMeta.usedFallback
                        ? 'Uso el fallback de ingles.'
                        : 'Genero respuesta pedagógica normal.',
                    ].join(' ')
                  : 'Cuando generes una respuesta, aqui veras si uso fallback y como interpreto el turno.'}
              </p>
            </div>
          </article>
        </section>

        <section className="rounded-[2rem] bg-white p-8 shadow-card">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
            Modo peluche
          </p>
          <p className="mt-4 text-base leading-7 text-ink/70">
            Esta vista ya no depende del login del profesor en este navegador.
            Lee una configuracion publica publicada desde el panel docente para que
            el peluche pueda funcionar de forma mas estable.
          </p>
        </section>
      </div>
    </main>
  );
}

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') {
    return null;
  }

  const speechRecognition = (
    window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }
  ).SpeechRecognition;

  const webkitSpeechRecognition = (
    window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }
  ).webkitSpeechRecognition;

  return speechRecognition ?? webkitSpeechRecognition ?? null;
}

function extractTranscript(event: {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{
      transcript: string;
    }>
  >;
}) {
  let transcript = '';

  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    transcript += event.results[index][0]?.transcript ?? '';
  }

  return transcript.trim();
}

function processStudentTranscript(input: {
  transcript: string;
  wakePhrase: string;
  characterName: string;
  wakeSessionState: WakeSessionState;
  wakeAliases: string[];
}): ProcessedTranscriptResult {
  const rawTranscript = input.transcript.trim();
  const normalizedTranscript = normalizeSpeechText(rawTranscript);
  const normalizedWakePhrase = normalizeSpeechText(input.wakePhrase);
  const normalizedName = normalizeSpeechText(input.characterName);
  const normalizedAliases = input.wakeAliases
    .map(normalizeSpeechText)
    .filter(Boolean);
  const openingCues = buildOpeningCues(normalizedWakePhrase, normalizedName, normalizedAliases);
  const followUpCues = Array.from(
    new Set([normalizedName, ...normalizedAliases]),
  ).filter(Boolean);

  if (input.wakeSessionState === 'locked') {
    const openingCue = findMatchingCue(normalizedTranscript, openingCues);

    if (!openingCue) {
      return {
        kind: 'rejected',
        prompt: `Para empezar la sesion, primero di "${input.wakePhrase}" o una variante aceptada como "Hola ${input.characterName}".`,
      };
    }

    const remainder = stripWakeCue(normalizedTranscript, openingCue);

    if (!remainder) {
      return {
        kind: 'activation_only',
        prompt: `Sesion abierta. Ahora puedes seguir hablando durante un momento sin repetir la frase completa.`,
      };
    }

    return {
      kind: 'question',
      question: remainder,
      prompt: `Sesion abierta con "${input.wakePhrase}". Pregunta capturada: ${remainder}`,
    };
  }

  const followUpCue = findMatchingCue(normalizedTranscript, followUpCues);
  const remainder = followUpCue
    ? stripWakeCue(normalizedTranscript, followUpCue)
    : normalizedTranscript;

  if (!remainder) {
    return {
      kind: 'activation_only',
      prompt: 'Te escucho. Puedes seguir hablando con naturalidad.',
    };
  }

  return {
    kind: 'question',
    question: remainder,
    prompt: followUpCue
      ? `Turno de seguimiento aceptado con "${input.characterName}". Pregunta capturada: ${remainder}`
      : `Turno de seguimiento aceptado dentro de la sesion abierta. Pregunta capturada: ${remainder}`,
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

function stripWakeCue(transcript: string, cue: string) {
  if (transcript === cue) {
    return '';
  }

  if (transcript.startsWith(`${cue} `)) {
    return transcript.slice(cue.length).trim();
  }

  return transcript;
}

function formatResponseMode(mode?: 'strict' | 'guided') {
  return mode === 'guided' ? 'Guiado' : 'Estricto';
}

function formatFreedomLevel(level?: 'low' | 'medium' | 'high') {
  switch (level) {
    case 'high':
      return 'Alta';
    case 'medium':
      return 'Media';
    default:
      return 'Baja';
  }
}

function formatDetectedLanguage(
  language: ConversationTurnResult['detectedLanguage'],
) {
  switch (language) {
    case 'es':
      return 'Espanol';
    case 'en':
      return 'Ingles';
    case 'mixed':
      return 'Mixto';
    default:
      return 'Desconocido';
  }
}

function mapSpeechError(error?: string) {
  switch (error) {
    case 'not-allowed':
      return 'El microfono fue bloqueado. Permite acceso al microfono y vuelve a intentarlo.';
    case 'no-speech':
      return 'No se detecto voz en esta prueba. Intenta hablar mas cerca del microfono.';
    case 'audio-capture':
      return 'No se encontro un microfono disponible para esta pagina.';
    case 'network':
      return 'El reconocimiento de voz fallo por red o por el servicio del navegador.';
    default:
      return 'No se pudo completar la prueba de voz en este navegador.';
  }
}

function pickPreferredVoice(
  voices: SpeechSynthesisVoice[],
  preferredVoiceId?: string,
) {
  const normalizedPreferred = normalizeSpeechText(preferredVoiceId ?? '');

  if (normalizedPreferred) {
    const exactMatch = voices.find((voice) => {
      const haystack = normalizeSpeechText(
        `${voice.name} ${voice.lang} ${voice.voiceURI}`,
      );
      return haystack.includes(normalizedPreferred);
    });

    if (exactMatch) {
      return exactMatch;
    }
  }

  return (
    voices.find((voice) => /^es(-|_)/i.test(voice.lang)) ??
    voices.find((voice) => /spanish|espanol/i.test(voice.name)) ??
    null
  );
}

function getConversationLabel(
  status: SessionStatus,
  conversationStatus: ConversationStatus,
) {
  if (status !== 'ready') {
    return 'Pendiente';
  }

  switch (conversationStatus) {
    case 'wake_detected':
      return 'Sesion abierta';
    case 'listening':
      return 'Escuchando';
    case 'transcribing':
      return 'Transcribiendo';
    case 'thinking':
      return 'Pensando';
    case 'speaking':
      return 'Hablando';
    case 'error':
      return 'Error';
    default:
      return 'En espera';
  }
}
