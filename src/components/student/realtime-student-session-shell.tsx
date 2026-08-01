'use client';

import { useCallback, useEffect, useState } from 'react';
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

export function RealtimeStudentSessionShell() {
  const [runtime, setRuntime] = useState<StudentRuntimeConfig | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<
    'booting' | 'ready' | 'missing-config' | 'error'
  >('booting');
  const [runtimeMessage, setRuntimeMessage] = useState(
    'Cargando configuracion activa del peluche...',
  );
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

  const currentStateLabel = getStateLabel(realtimeSession.state);
  const currentStateMessage = getStateMessage(realtimeSession.state, runtime?.activeCharacter.name);

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
                Conversacion realtime del peluche.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-ink/75">
                Esta version ya no usa el pipeline mecanico de voz a texto y voz
                del navegador. Aqui la meta es probar una conversacion mas natural
                y continua.
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
                  disabled={
                    runtimeStatus !== 'ready' ||
                    !runtime ||
                    realtimeSession.state === 'requesting_permission' ||
                    realtimeSession.state === 'connecting' ||
                    realtimeSession.connectionReady
                  }
                  className="w-full rounded-full border-2 border-white/30 bg-coral px-6 py-4 text-lg font-extrabold text-white transition enabled:hover:scale-[1.01] enabled:hover:border-white disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {runtime
                    ? `Hablar con ${runtime.activeCharacter.name}`
                    : 'Hablar con el peluche'}
                </button>

                <button
                  type="button"
                  onClick={() => void realtimeSession.endSession('ended')}
                  disabled={!realtimeSession.connectionReady}
                  className="w-full rounded-full border border-white/20 px-6 py-4 text-base font-bold text-white/90 transition enabled:hover:border-coral enabled:hover:text-coral disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Terminar conversacion
                </button>

                <p className="text-sm leading-6 text-white/70">
                  {runtimeStatus === 'ready'
                    ? 'Pulsa para abrir la sesion realtime. Dentro de la sesion, el modelo mantiene el contexto sin volver a empezar en cada turno.'
                    : runtimeMessage}
                </p>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] bg-white p-8 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              Captura de voz
            </p>
            <h2 className="mt-4 text-3xl font-extrabold">Ultima intervencion</h2>
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
              Respuesta del peluche
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
