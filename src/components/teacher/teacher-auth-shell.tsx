'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AppModeNav } from '@/components/app/app-mode-nav';
import type { User } from 'firebase/auth';
import { ActiveAssignmentManager } from '@/components/teacher/active-assignment-manager';
import { CharacterManager } from '@/components/teacher/character-manager';
import { FirebaseStatusCard } from '@/components/teacher/firebase-status-card';
import { LessonManager } from '@/components/teacher/lesson-manager';
import {
  prepareTeacherAuthSession,
  registerTeacher,
  signInTeacher,
  signOutTeacher,
  subscribeToTeacherAuth,
} from '@/lib/firebase/auth';
import { getFirebaseProjectId } from '@/lib/firebase/config';

const modules = [
  'Preparar la clase de hoy en pocos pasos',
  'Activar una combinacion lista para el peluche',
  'Esconder lo tecnico dentro de opciones avanzadas',
  'Mantener biblioteca de lecciones y personajes',
];

type AuthMode = 'signin' | 'signup';
type AuthStatus = 'booting' | 'signed-out' | 'signed-in';
const AUTH_BOOT_TIMEOUT_MS = 3500;

export function TeacherAuthShell() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [status, setStatus] = useState<AuthStatus>('booting');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let bootTimeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    async function bootstrapAuth() {
      try {
        unsubscribe = subscribeToTeacherAuth((nextUser) => {
          settled = true;
          if (bootTimeout) {
            clearTimeout(bootTimeout);
          }
          setUser(nextUser);
          setStatus(nextUser ? 'signed-in' : 'signed-out');
        });

        bootTimeout = setTimeout(() => {
          if (settled) {
            return;
          }

          setStatus('signed-out');
          setError('');
        }, AUTH_BOOT_TIMEOUT_MS);

        await prepareTeacherAuthSession();
      } catch (authError) {
        settled = true;
        if (bootTimeout) {
          clearTimeout(bootTimeout);
        }
        setError(
          authError instanceof Error
            ? authError.message
            : 'No se pudo inicializar Firebase Authentication.',
        );
        setStatus('signed-out');
      }
    }

    void bootstrapAuth();

    return () => {
      if (bootTimeout) {
        clearTimeout(bootTimeout);
      }
      unsubscribe?.();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (mode === 'signin') {
        await signInTeacher(email.trim(), password);
      } else {
        await registerTeacher(email.trim(), password);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No se pudo completar la autenticacion.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setError('');

    try {
      await signOutTeacher();
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : 'No se pudo cerrar sesion.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fff9f0] px-6 py-6 text-ink md:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <AppModeNav currentLabel="Aqui ajustas reglas, contenido y activaciones antes de pasar al alumno o al peluche." />

        <section className="rounded-[1.75rem] bg-white px-6 py-5 shadow-card">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="space-y-3">
              <span className="inline-flex rounded-full bg-sun px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em]">
                Panel del profesor
              </span>
              <h1 className="text-3xl font-extrabold md:text-4xl">
                Vista compacta para preparar la clase y activar el peluche.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-ink/72">
                Priorizamos lo diario arriba y dejamos la biblioteca y los ajustes
                finos mas abajo o colapsados.
              </p>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-coral">
                Firebase activo: {getFirebaseProjectId()}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {modules.slice(0, 3).map((module) => (
                <div
                  key={module}
                  className="rounded-[1.25rem] bg-[#f8fbff] px-4 py-4 text-sm font-bold leading-6 text-ink/80"
                >
                  {module}
                </div>
              ))}
            </div>
          </div>
        </section>

        {status === 'booting' ? (
          <section className="rounded-[2rem] bg-white p-8 shadow-card">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
              Autenticacion
            </p>
            <h2 className="mt-4 text-3xl font-extrabold">
              Verificando sesion del profesor...
            </h2>
          </section>
        ) : null}

        {status === 'signed-out' ? (
          <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-[2rem] bg-white p-8 shadow-card">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
                Acceso docente
              </p>
              <h2 className="mt-4 text-3xl font-extrabold">
                Entra al panel o crea la primera cuenta.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-ink/70">
                Si todavia no tienes usuario, usa `Crear cuenta` una sola vez con
                tu correo del profesor. Despues podras entrar normalmente con
                `Iniciar sesion`.
              </p>

              <div className="mt-6 inline-flex rounded-full bg-[#f8fbff] p-1">
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                    mode === 'signin'
                      ? 'bg-coral text-white'
                      : 'text-ink/65 hover:text-ink'
                  }`}
                >
                  Iniciar sesion
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                    mode === 'signup'
                      ? 'bg-coral text-white'
                      : 'text-ink/65 hover:text-ink'
                  }`}
                >
                  Crear cuenta
                </button>
              </div>

              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-ink/70">
                    Correo electronico
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
                    placeholder="profe@ejemplo.com"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-ink/70">
                    Contrasena
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
                    placeholder="Minimo 6 caracteres"
                    minLength={6}
                    required
                  />
                </label>

                {error ? (
                  <p className="rounded-2xl bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b84e28]">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-coral px-6 py-3 font-bold text-white transition hover:bg-[#ef7444] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {busy
                    ? 'Procesando...'
                    : mode === 'signin'
                      ? 'Entrar al panel'
                      : 'Crear cuenta docente'}
                </button>
              </form>
            </article>

            <article className="rounded-[2rem] bg-white p-8 shadow-card">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">
                Estado actual
              </p>
              <div className="mt-6 grid gap-4">
                <div className="rounded-[1.5rem] border border-ink/10 p-5">
                  <p className="text-sm font-bold text-ink/55">Proyecto</p>
                  <p className="mt-2 text-2xl font-extrabold">
                    proyecto-mini-profe
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-ink/10 p-5">
                  <p className="text-sm font-bold text-ink/55">Auth provider</p>
                  <p className="mt-2 text-2xl font-extrabold">
                    Email y contrasena
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-ink/10 p-5">
                  <p className="text-sm font-bold text-ink/55">Firestore</p>
                  <p className="mt-2 text-2xl font-extrabold">Listo y separado</p>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {status === 'signed-in' && user ? (
          <>
            <section className="rounded-[1.75rem] bg-white px-6 py-5 shadow-card">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
                    Panel listo
                  </p>
                  <h2 className="text-2xl font-extrabold md:text-3xl">
                    Lo importante de hoy primero.
                  </h2>
                  <p className="max-w-3xl text-sm leading-6 text-ink/70">
                    Usa la activacion del peluche arriba. Baja solo cuando quieras
                    crear o editar una leccion o un personaje.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full bg-[#f8fbff] px-4 py-2 text-sm font-bold text-ink/80">
                    {user.email}
                  </div>
                  <div className="rounded-full bg-[#f8fbff] px-4 py-2 text-sm font-bold text-ink/80">
                    Firebase conectado
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={busy}
                    className="rounded-full border border-ink/10 px-5 py-2.5 text-sm font-bold text-ink transition hover:border-coral hover:text-coral disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Cerrar sesion
                  </button>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-6">
              <ActiveAssignmentManager user={user} />
              <div className="lg:hidden">
                <FirebaseStatusCard />
              </div>
              <LessonManager user={user} />
              <CharacterManager user={user} />
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
