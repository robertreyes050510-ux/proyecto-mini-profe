'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppModeNav } from '@/components/app/app-mode-nav';
import { getPublishedStudentRuntimeConfig } from '@/features/teacher-config/services/student-runtime-service';
import { useRealtimeSession } from '@/features/realtime/useRealtimeSession';
import type { RealtimeStudentState } from '@/features/realtime/realtimeTypes';
import type { StudentRuntimeConfig } from '@/features/teacher-config/types/student-runtime';

const stateCards: Array<{
  label: string;
  phase: RealtimeStudentState;
  description: string;
}> = [
  {
    label: 'Inactivo',
    phase: 'idle',
    description: 'Todavia no hay una conversacion abierta.',
  },
  {
    label: 'Conectando',
    phase: 'connecting',
    description: 'Preparando microfono, WebRTC y sesion segura.',
  },
  {
    label: 'Escuchando',
    phase: 'listening',
    description: 'El peluche esta atento y esperando tu voz.',
  },
  {
    label: 'Alumno hablando',
    phase: 'user_speaking',
    description: 'La intervencion del estudiante sigue en curso.',
  },
  {
    label: 'Pensando',
    phase: 'model_processing',
    description: 'El personaje esta preparando su respuesta.',
  },
  {
    label: 'Hablando',
    phase: 'model_speaking',
    description: 'La respuesta sale como audio en tiempo real.',
  },
];

type RealtimeStudentSessionShellProps = {
  surface?: 'student' | 'plush';
};

type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

const PLUSH_EXIT_PIN = process.env.NEXT_PUBLIC_PLUSH_EXIT_PIN || '2468';
const PLUSH_EXIT_HOLD_MS = 3000;

type PlushAdminAction = 'exit' | 'rest';

export function RealtimeStudentSessionShell({
  surface = 'student',
}: RealtimeStudentSessionShellProps) {
  const [runtime, setRuntime] = useState<StudentRuntimeConfig | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<
    'booting' | 'ready' | 'missing-config' | 'error'
  >('booting');
  const [runtimeMessage, setRuntimeMessage] = useState(
    'Cargando configuracion activa del peluche...',
  );
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [pendingAdminAction, setPendingAdminAction] =
    useState<PlushAdminAction>('exit');
  const [exitPinValue, setExitPinValue] = useState('');
  const [exitError, setExitError] = useState('');
  const [holdActive, setHoldActive] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [screenProtectionStatus, setScreenProtectionStatus] = useState<
    'idle' | 'ready' | 'unsupported' | 'blocked'
  >('idle');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const plushExitTimerRef = useRef<number | null>(null);
  const bypassPopstateRef = useRef(false);
  const realtimeSession = useRealtimeSession(runtime);

  const loadRuntime = useCallback(async () => {
    setRuntimeStatus('booting');
    setRuntimeMessage('Cargando configuracion activa del peluche...');

    try {
      const publishedRuntime = await getPublishedStudentRuntimeConfig();

      if (!publishedRuntime) {
        setRuntime(null);
        setRuntimeStatus('missing-config');
        setRuntimeMessage(
          'Todavia no hay una configuracion publicada desde el panel del profesor.',
        );
        return;
      }

      setRuntime(publishedRuntime);
      setRuntimeStatus('ready');
      setRuntimeMessage('El peluche ya puede abrir una conversacion realtime.');
    } catch (runtimeError) {
      setRuntime(null);
      setRuntimeStatus('error');
      setRuntimeMessage(
        runtimeError instanceof Error
          ? runtimeError.message
          : 'No se pudo cargar la configuracion del peluche.',
      );
    }
  }, []);

  useEffect(() => {
    void loadRuntime();
  }, [loadRuntime]);

  const releaseWakeLock = useCallback(async () => {
    const currentWakeLock = wakeLockRef.current;
    if (!currentWakeLock) {
      return;
    }

    wakeLockRef.current = null;
    await currentWakeLock.release().catch(() => undefined);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (surface !== 'plush' || typeof navigator === 'undefined') {
      return;
    }

    const wakeLockNavigator = navigator as NavigatorWithWakeLock;

    if (!wakeLockNavigator.wakeLock?.request) {
      setScreenProtectionStatus('unsupported');
      return;
    }

    try {
      await releaseWakeLock();
      wakeLockRef.current = await wakeLockNavigator.wakeLock.request('screen');
      setScreenProtectionStatus('ready');
    } catch {
      setScreenProtectionStatus('blocked');
    }
  }, [releaseWakeLock, surface]);

  const requestFullscreen = useCallback(async () => {
    if (surface !== 'plush' || typeof document === 'undefined') {
      return;
    }

    if (document.fullscreenElement) {
      setIsFullscreen(true);
      return;
    }

    const fullscreenHost = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
    };

    if (!fullscreenHost.requestFullscreen) {
      return;
    }

    try {
      await fullscreenHost.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      setIsFullscreen(false);
    }
  }, [surface]);

  const preparePlushSurface = useCallback(async () => {
    if (surface !== 'plush') {
      return;
    }

    await requestFullscreen();
    await requestWakeLock();
  }, [requestFullscreen, requestWakeLock, surface]);

  const handleReinforceProtection = useCallback(async () => {
    await preparePlushSurface();
    setRuntimeMessage(
      'Proteccion reintentada. Si el navegador lo permite, la pantalla queda despierta y en pantalla completa.',
    );
  }, [preparePlushSurface]);

  const handleStartSession = useCallback(async () => {
    await preparePlushSurface();
    await realtimeSession.startSession();
  }, [preparePlushSurface, realtimeSession]);

  useEffect(() => {
    if (surface !== 'plush' || typeof document === 'undefined') {
      return;
    }

    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, [surface]);

  useEffect(() => {
    if (surface !== 'plush' || typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestWakeLock, surface]);

  useEffect(() => {
    return () => {
      if (plushExitTimerRef.current) {
        clearTimeout(plushExitTimerRef.current);
      }
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  useEffect(() => {
    if (surface !== 'plush' || typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      if (bypassPopstateRef.current) {
        return;
      }

      window.history.pushState({ plushGuard: true }, '', window.location.href);
      setPendingAdminAction('exit');
      setExitModalOpen(true);
      setExitError('');
      setRuntimeMessage(
        'La salida del modo peluche requiere el PIN del profesor.',
      );
    };

    window.history.pushState({ plushGuard: true }, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [surface]);

  const currentStateLabel = getStateLabel(realtimeSession.state);
  const currentStateMessage = getStateMessage(realtimeSession.state, runtime?.activeCharacter.name);
  const isPlushSurface = surface === 'plush';
  const navLabel = isPlushSurface
    ? 'Esta vista esta pensada para dejar el telefono fijo dentro del peluche.'
    : 'Esta vista sirve para pruebas, observacion y demostraciones del alumno.';
  const heroBadge = isPlushSurface ? 'Modo peluche' : 'Modo estudiante';
  const heroTitle = isPlushSurface
    ? 'Sesion viva del peluche lista para quedarse abierta en el telefono.'
    : 'Conversacion realtime del peluche.';
  const heroDescription = isPlushSurface
    ? 'Aqui dejamos una interfaz mas directa, con menos distracciones y foco total en escuchar, responder y mantener la conversacion dentro del peluche.'
    : 'Esta version ya no usa el pipeline mecanico de voz a texto y voz del navegador. Aqui la meta es probar una conversacion mas natural y continua.';
  const connectLabel = runtime
    ? isPlushSurface
      ? `Encender a ${runtime.activeCharacter.name}`
      : `Hablar con ${runtime.activeCharacter.name}`
    : isPlushSurface
      ? 'Encender peluche'
      : 'Hablar con el peluche';
  const helperText =
    runtimeStatus === 'ready'
      ? isPlushSurface
        ? 'Deja esta pantalla abierta en el telefono del peluche para conversar sin volver al panel docente.'
        : 'Pulsa para abrir la sesion realtime. Dentro de la sesion, el modelo mantiene el contexto sin volver a empezar en cada turno.'
      : runtimeMessage;
  const transcriptSectionLabel = isPlushSurface ? 'Actividad del peluche' : 'Captura de voz';
  const transcriptTitle = isPlushSurface ? 'Ultimo intercambio' : 'Ultima intervencion';
  const responseSectionLabel = isPlushSurface ? 'Respuesta en curso' : 'Respuesta del peluche';
  const canStartSession =
    runtimeStatus === 'ready' &&
    !!runtime &&
    realtimeSession.state !== 'requesting_permission' &&
    realtimeSession.state !== 'connecting' &&
    !realtimeSession.connectionReady;
  const canEndSession = realtimeSession.connectionReady;
  const plushProtectionLabel =
    screenProtectionStatus === 'ready'
      ? 'Proteccion activa'
      : screenProtectionStatus === 'unsupported'
        ? 'Proteccion parcial'
        : screenProtectionStatus === 'blocked'
          ? 'Proteccion bloqueada'
          : 'Proteccion pendiente';
  const plushProtectionMessage =
    screenProtectionStatus === 'ready'
      ? 'La pantalla intenta permanecer despierta mientras el peluche esta en uso.'
      : screenProtectionStatus === 'unsupported'
        ? 'Este navegador no permite fijar la pantalla despierta, pero el modo peluche sigue disponible.'
        : screenProtectionStatus === 'blocked'
          ? 'No se pudo fijar la pantalla. Puedes reactivarla desde controles del adulto.'
          : 'La proteccion se prepara al abrir la sesion de voz.';
  const openProtectedExitModal = useCallback((action: PlushAdminAction = 'exit') => {
    if (!isPlushSurface) {
      return;
    }

    setPendingAdminAction(action);
    setExitModalOpen(true);
    setExitPinValue('');
    setExitError('');
    setHoldActive(false);
    setRuntimeMessage(
      action === 'rest'
        ? 'Poner el peluche en reposo requiere el PIN del profesor.'
        : 'La salida del modo peluche requiere el PIN del profesor.',
    );
  }, [isPlushSurface]);

  const clearPlushExitHold = useCallback(() => {
    if (plushExitTimerRef.current) {
      clearTimeout(plushExitTimerRef.current);
      plushExitTimerRef.current = null;
    }
    setHoldActive(false);
  }, []);

  const startPlushExitHold = useCallback(() => {
    if (!isPlushSurface || exitBusy) {
      return;
    }

    clearPlushExitHold();
    setHoldActive(true);
    plushExitTimerRef.current = window.setTimeout(() => {
      plushExitTimerRef.current = null;
      openProtectedExitModal();
    }, PLUSH_EXIT_HOLD_MS);
  }, [clearPlushExitHold, exitBusy, isPlushSurface, openProtectedExitModal]);

  const resolveProtectedExitHref = useCallback(() => {
    if (typeof window === 'undefined') {
      return '/teacher';
    }

    if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);

        if (
          referrerUrl.origin === window.location.origin &&
          referrerUrl.pathname !== '/plush'
        ) {
          return `${referrerUrl.pathname}${referrerUrl.search}${referrerUrl.hash}`;
        }
      } catch {
        return '/teacher';
      }
    }

    return '/teacher';
  }, []);

  const confirmProtectedExit = useCallback(async () => {
    if (exitPinValue.trim() !== PLUSH_EXIT_PIN) {
      setExitError('PIN incorrecto. Usa el PIN del profesor para salir.');
      return;
    }

    setExitBusy(true);
    setExitError('');

    try {
      if (realtimeSession.connectionReady) {
        await realtimeSession.endSession('ended');
      }

      if (pendingAdminAction === 'rest') {
        setExitModalOpen(false);
        setExitPinValue('');
        setRuntimeMessage('El peluche quedo en reposo y listo para volver a usarse.');
        return;
      }

      bypassPopstateRef.current = true;
      window.location.href = resolveProtectedExitHref();
    } finally {
      setExitBusy(false);
    }
  }, [exitPinValue, pendingAdminAction, realtimeSession, resolveProtectedExitHref]);

  if (isPlushSurface) {
    return (
      <main className="relative min-h-screen select-none overscroll-none bg-gradient-to-b from-[#fffdf8] via-[#eef9ff] to-[#dff4ff] px-4 py-6 [touch-action:manipulation]">
        <button
          type="button"
          onPointerDown={startPlushExitHold}
          onPointerUp={clearPlushExitHold}
          onPointerLeave={clearPlushExitHold}
          onPointerCancel={clearPlushExitHold}
          className="absolute left-0 top-0 z-20 h-20 w-20 opacity-0"
          aria-label="Salida administrativa oculta"
        />
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          <section className="rounded-[2rem] bg-ink p-6 text-white shadow-card">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
              <div className="space-y-6 text-center lg:text-left">
                <span className="inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-white/75">
                  {heroBadge}
                </span>

                <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full bg-white/12 lg:mx-0">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-coral text-3xl font-extrabold text-white">
                    {runtime?.activeCharacter.name?.slice(0, 8) || 'Mini'}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/70">
                    Estado actual
                  </p>
                  <h1 className="text-4xl font-extrabold">{currentStateLabel}</h1>
                  <p className="text-base leading-7 text-white/80">
                    {currentStateMessage}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => void handleStartSession()}
                    disabled={!canStartSession}
                    className="w-full rounded-full border-2 border-white/25 bg-coral px-6 py-4 text-lg font-extrabold text-white transition enabled:hover:scale-[1.01] enabled:hover:border-white disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {connectLabel}
                  </button>

                  <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-[1.5rem] border border-white/12 bg-white/8 p-4 text-left">
                      <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">
                        Proteccion del modo peluche
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/75">
                        Esta vista no muestra salida visible. Para abrir la salida
                        administrativa, manten presionada la esquina superior
                        izquierda durante 3 segundos.
                      </p>

                      <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-black/10 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/65">
                          Pantalla del peluche
                        </p>
                        <p className="mt-2 text-base font-semibold text-white">
                          {plushProtectionLabel}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-white/75">
                          {plushProtectionMessage}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-white/55">
                          {isFullscreen
                            ? 'La vista esta en pantalla completa.'
                            : 'Si el navegador lo permite, la pantalla completa se reactiva al iniciar la sesion.'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleReinforceProtection()}
                        className="mt-4 w-full rounded-full border border-white/20 px-6 py-4 text-base font-bold text-white/90 transition hover:border-coral hover:text-coral"
                      >
                        Reforzar proteccion de pantalla
                      </button>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-white/6 px-4 py-4 text-left">
                      <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">
                        Acciones del profesor
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/75">
                        {helperText}
                      </p>

                      <button
                        type="button"
                        onClick={() => openProtectedExitModal('rest')}
                        disabled={!canEndSession}
                        className="mt-4 w-full rounded-full border border-white/20 px-6 py-4 text-base font-bold text-white/90 transition enabled:hover:border-coral enabled:hover:text-coral disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Poner peluche en reposo
                      </button>

                      <p className="mt-4 text-xs leading-5 text-white/55">
                        {holdActive
                          ? 'Manteniendo esquina administrativa... suelta para cancelar.'
                          : 'Reposo y salida quedan protegidos con el PIN del profesor.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              {transcriptSectionLabel}
            </p>
            <h2 className="mt-3 text-2xl font-extrabold">{transcriptTitle}</h2>
            <div className="mt-5 space-y-4">
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#f7fbff] p-5">
                <p className="text-sm font-bold text-ink/55">Texto capturado</p>
                <p className="mt-3 text-xl font-semibold leading-8 text-ink">
                  {realtimeSession.lastTranscript || 'Todavia no hay una intervencion transcrita.'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#fdfcf8] p-5">
                <p className="text-sm font-bold text-ink/55">Microfono</p>
                <p className="mt-3 text-base leading-7 text-ink/80">
                  {realtimeSession.permissionMessage ||
                    formatPermission(realtimeSession.permission)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              {responseSectionLabel}
            </p>
            <h2 className="mt-3 text-2xl font-extrabold">Respuesta del peluche</h2>
            <div className="mt-5 space-y-4">
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#f7fbff] p-5">
                <p className="text-sm font-bold text-ink/55">Ultimo texto generado</p>
                <p className="mt-3 text-xl font-semibold leading-8 text-ink">
                  {realtimeSession.assistantReply || 'Todavia no hay una respuesta generada.'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#fdfcf8] p-5">
                <p className="text-sm font-bold text-ink/55">Sesion tecnica</p>
                <p className="mt-3 text-base leading-7 text-ink/75">
                  {realtimeSession.sessionInfo
                    ? `Modelo: ${realtimeSession.sessionInfo.model}. Voz: ${realtimeSession.sessionInfo.voice}.`
                    : 'La sesion realtime aun no esta conectada.'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              Configuracion activa
            </p>
            <div className="mt-5 grid gap-4">
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#fdfcf8] p-5">
                <p className="text-sm font-bold text-ink/55">Personaje</p>
                <p className="mt-2 text-xl font-semibold text-ink">
                  {runtime?.activeCharacter.name || 'Sin personaje'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#fdfcf8] p-5">
                <p className="text-sm font-bold text-ink/55">Leccion</p>
                <p className="mt-2 text-xl font-semibold text-ink">
                  {runtime?.activeLesson.topic || 'Sin tema'}
                </p>
              </div>
            </div>
          </section>

          {(realtimeSession.error || runtimeStatus === 'error') && (
            <section className="rounded-[2rem] border border-coral/30 bg-[#fff1eb] p-5 shadow-card">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
                Error
              </p>
              <p className="mt-3 text-base leading-7 text-ink">
                {realtimeSession.error || runtimeMessage}
              </p>
            </section>
          )}
        </div>

        {exitModalOpen ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/55 px-4">
            <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-card">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-coral">
                Salida administrativa
              </p>
              <h2 className="mt-3 text-2xl font-extrabold text-ink">
                Salir del modo peluche
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink/70">
                {pendingAdminAction === 'rest'
                  ? 'Introduce el PIN del profesor para detener la conversacion y dejar el peluche en reposo.'
                  : 'Introduce el PIN del profesor para volver al panel anterior.'}
              </p>

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-bold text-ink/70">
                  PIN del profesor
                </span>
                <input
                  type="password"
                  inputMode="numeric"
                  value={exitPinValue}
                  onChange={(event) => {
                    setExitPinValue(event.target.value);
                    setExitError('');
                  }}
                  className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
                  placeholder="PIN"
                  autoFocus
                />
              </label>

              {exitError ? (
                <p className="mt-4 rounded-2xl bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b84e28]">
                  {exitError}
                </p>
              ) : null}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setExitModalOpen(false);
                    setExitPinValue('');
                    setExitError('');
                  }}
                  className="rounded-full border border-ink/10 px-4 py-3 text-sm font-bold text-ink transition hover:border-coral hover:text-coral"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmProtectedExit()}
                  disabled={exitBusy}
                  className="rounded-full bg-coral px-4 py-3 text-sm font-bold text-white transition hover:bg-[#ef7444] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {exitBusy
                    ? 'Verificando...'
                    : pendingAdminAction === 'rest'
                      ? 'Confirmar reposo'
                      : 'Salir del modo peluche'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fffdf8] via-[#eef9ff] to-[#dff4ff] px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <AppModeNav currentLabel={navLabel} />

        <section className="grid gap-8 rounded-[2rem] bg-white/80 p-8 shadow-card backdrop-blur lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <span className="inline-flex rounded-full bg-mint px-4 py-2 text-sm font-bold uppercase tracking-[0.2em] text-ink">
              {heroBadge}
            </span>
            <div className="space-y-4">
              <h1 className="text-4xl font-extrabold md:text-5xl">
                {heroTitle}
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-ink/75">
                {heroDescription}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {stateCards.map((card) => (
                <article
                  key={card.label}
                  className={`rounded-[1.5rem] border p-5 ${
                    realtimeSession.state === card.phase
                      ? 'border-coral bg-[#fff1eb]'
                      : 'border-ink/10 bg-[#fdfcf8]'
                  }`}
                >
                  <h2 className="text-lg font-extrabold">{card.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-ink/70">
                    {card.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-[2.25rem] bg-ink p-8 text-white shadow-card">
            <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-between gap-8 text-center">
              <div className="space-y-6">
                <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full bg-white/12">
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-coral text-4xl font-extrabold text-white">
                    {runtime?.activeCharacter.name?.slice(0, 8) || 'Mini'}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/75">
                    Estado actual
                  </p>
                  <h2 className="text-4xl font-extrabold">{currentStateLabel}</h2>
                  <p className="text-lg leading-8 text-white/80">
                    {currentStateMessage}
                  </p>
                </div>
              </div>

              <div className="w-full space-y-4">
                <button
                  type="button"
                  onClick={() => void realtimeSession.startSession()}
                  disabled={!canStartSession}
                  className="w-full rounded-full border-2 border-white/30 bg-coral px-6 py-4 text-lg font-extrabold text-white transition enabled:hover:scale-[1.01] enabled:hover:border-white disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {connectLabel}
                </button>

                <button
                  type="button"
                  onClick={() => void realtimeSession.endSession('ended')}
                  disabled={!canEndSession}
                  className="w-full rounded-full border border-white/20 px-6 py-4 text-base font-bold text-white/90 transition enabled:hover:border-coral enabled:hover:text-coral disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Terminar conversacion
                </button>

                <p className="text-sm leading-6 text-white/70">
                  {helperText}
                </p>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] bg-white p-8 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              {transcriptSectionLabel}
            </p>
            <h2 className="mt-4 text-3xl font-extrabold">{transcriptTitle}</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#f7fbff] p-5">
                <p className="text-sm font-bold text-ink/55">Texto capturado</p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {realtimeSession.lastTranscript || 'Todavia no hay una intervencion transcrita.'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#fdfcf8] p-5">
                <p className="text-sm font-bold text-ink/55">Microfono</p>
                <p className="mt-3 text-lg text-ink/80">
                  {realtimeSession.permissionMessage ||
                    formatPermission(realtimeSession.permission)}
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-8 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              {responseSectionLabel}
            </p>
            <h2 className="mt-4 text-3xl font-extrabold">Audio y transcript</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#f7fbff] p-5">
                <p className="text-sm font-bold text-ink/55">Ultimo texto generado</p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {realtimeSession.assistantReply || 'Todavia no hay una respuesta generada.'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-ink/10 bg-[#fdfcf8] p-5">
                <p className="text-sm font-bold text-ink/55">Sesion tecnica</p>
                <p className="mt-3 text-base leading-7 text-ink/75">
                  {realtimeSession.sessionInfo
                    ? `Modelo: ${realtimeSession.sessionInfo.model}. Voz: ${realtimeSession.sessionInfo.voice}.`
                    : 'La sesion realtime aun no esta conectada.'}
                </p>
              </div>
            </div>
          </article>
        </section>

        {(realtimeSession.error || runtimeStatus === 'error') && (
          <section className="rounded-[2rem] border border-coral/30 bg-[#fff1eb] p-6 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              Error
            </p>
            <p className="mt-3 text-lg leading-8 text-ink">
              {realtimeSession.error || runtimeMessage}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function getStateLabel(state: RealtimeStudentState) {
  switch (state) {
    case 'requesting_permission':
      return 'Pidiendo permiso';
    case 'connecting':
      return 'Conectando';
    case 'listening':
      return 'Escuchando';
    case 'user_speaking':
      return 'Alumno hablando';
    case 'model_processing':
      return 'Pensando';
    case 'model_speaking':
      return 'Hablando';
    case 'reconnecting':
      return 'Reconectando';
    case 'error':
      return 'Error';
    case 'ended':
      return 'Sesion terminada';
    case 'idle':
    default:
      return 'Inactivo';
  }
}

function getStateMessage(
  state: RealtimeStudentState,
  characterName: string | undefined,
) {
  switch (state) {
    case 'requesting_permission':
      return 'Necesitamos el microfono para empezar.';
    case 'connecting':
      return 'Abriendo WebRTC y preparando la voz del personaje.';
    case 'listening':
      return `${characterName || 'El personaje'} ya esta listo para escucharte.`;
    case 'user_speaking':
      return 'Sigue hablando con naturalidad. La sesion permanece abierta.';
    case 'model_processing':
      return 'El personaje esta preparando una respuesta mas natural.';
    case 'model_speaking':
      return 'La respuesta ya se esta reproduciendo como audio realtime.';
    case 'reconnecting':
      return 'La conexion se movio. Intentamos estabilizarla.';
    case 'error':
      return 'Hubo un problema tecnico en la sesion.';
    case 'ended':
      return 'La sesion se cerro y se liberaron microfono y conexion.';
    case 'idle':
    default:
      return 'Pulsa el boton para abrir la conversacion.';
  }
}

function formatPermission(permission: string) {
  switch (permission) {
    case 'granted':
      return 'Microfono permitido.';
    case 'denied':
      return 'Microfono bloqueado.';
    case 'prompt':
      return 'El navegador todavia no ha decidido el permiso.';
    case 'unknown':
    default:
      return 'Todavia no hemos comprobado el permiso del microfono.';
  }
}
