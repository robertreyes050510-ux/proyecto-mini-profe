'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { listTeacherCharacters } from '@/features/teacher-config/services/character-service';
import { saveTeacherAssignment, getTeacherAssignment } from '@/features/teacher-config/services/assignment-service';
import { listTeacherLessons } from '@/features/teacher-config/services/lesson-service';
import type { TeacherCharacterRecord } from '@/features/teacher-config/types/character';
import type { TeacherLessonRecord } from '@/features/teacher-config/types/lesson';

export function ActiveAssignmentManager({ user }: { user: User }) {
  const [characters, setCharacters] = useState<TeacherCharacterRecord[]>([]);
  const [lessons, setLessons] = useState<TeacherLessonRecord[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState('');
  const [activeLessonId, setActiveLessonId] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Cargando configuracion activa del peluche...',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshAssignmentData = useCallback(async () => {
    try {
      const [nextCharacters, nextLessons] = await Promise.all([
        listTeacherCharacters(user.uid),
        listTeacherLessons(user.uid),
      ]);

      setCharacters(nextCharacters);
      setLessons(nextLessons);

      let assignment = null;

      try {
        assignment = await getTeacherAssignment(user.uid);
      } catch {
        setStatusMessage(
          'Personajes y lecciones cargados. Falta permiso o configuracion para leer la asignacion activa.',
        );
        setError(
          'La lectura de teacherSettings fue rechazada. Publica las reglas corregidas y vuelve a cargar la pagina.',
        );
        setActiveCharacterId(nextCharacters[0]?.id ?? '');
        setActiveLessonId(nextLessons[0]?.id ?? '');
        return;
      }

      if (assignment) {
        setActiveCharacterId(assignment.activeCharacterId);
        setActiveLessonId(assignment.activeLessonId);
        setStatusMessage('Configuracion activa cargada correctamente.');
      } else {
        setActiveCharacterId(nextCharacters[0]?.id ?? '');
        setActiveLessonId(nextLessons[0]?.id ?? '');
        setStatusMessage(
          'Selecciona un personaje y una leccion para definir la configuracion activa del estudiante.',
        );
      }

      setError('');
    } catch (loadError) {
      setError(getFriendlyFirestoreError(loadError));
      setStatusMessage('No se pudo cargar la asignacion activa.');
    }
  }, [user.uid]);

  useEffect(() => {
    void refreshAssignmentData();
  }, [refreshAssignmentData]);

  useEffect(() => {
    const handleTeacherConfigUpdated = () => {
      void refreshAssignmentData();
    };

    window.addEventListener(
      'teacher-characters-updated',
      handleTeacherConfigUpdated,
    );
    window.addEventListener(
      'teacher-lessons-updated',
      handleTeacherConfigUpdated,
    );

    return () => {
      window.removeEventListener(
        'teacher-characters-updated',
        handleTeacherConfigUpdated,
      );
      window.removeEventListener(
        'teacher-lessons-updated',
        handleTeacherConfigUpdated,
      );
    };
  }, [refreshAssignmentData]);

  const activeCharacter = useMemo(
    () => characters.find((character) => character.id === activeCharacterId) ?? null,
    [characters, activeCharacterId],
  );

  const activeLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === activeLessonId) ?? null,
    [lessons, activeLessonId],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await saveTeacherAssignment(user.uid, {
        activeCharacterId,
        activeLessonId,
      });
      setStatusMessage('Configuracion activa guardada para la app del estudiante.');
    } catch (saveError) {
      setError(getFriendlyFirestoreError(saveError));
    } finally {
      setBusy(false);
    }
  }

  const isReadyToAssign = characters.length > 0 && lessons.length > 0;

  return (
    <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <article className="rounded-[1.75rem] bg-white p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
          Clase de hoy
        </p>
        <h2 className="mt-3 text-2xl font-extrabold">
          Activa una combinacion lista
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-ink/70">
          Personaje, leccion y publicar. Sin pasos extra.
        </p>

        {!isReadyToAssign ? (
          <div className="mt-8 rounded-[1.5rem] border border-dashed border-ink/15 p-6 text-base leading-7 text-ink/60">
            Primero necesitas al menos un personaje y una leccion para poder crear
            una configuracion activa.
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-ink/70">
                  Personaje para hoy
                </span>
                <select
                  value={activeCharacterId}
                  onChange={(event) => setActiveCharacterId(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
                  required
                >
                  <option value="" disabled>
                    Selecciona un personaje
                  </option>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name} · {character.wakePhrase}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-ink/70">
                  Leccion para hoy
                </span>
                <select
                  value={activeLessonId}
                  onChange={(event) => setActiveLessonId(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
                  required
                >
                  <option value="" disabled>
                    Selecciona una leccion
                  </option>
                  {lessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.topic} · {lesson.gradeLevel}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? (
              <p className="rounded-2xl bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b84e28]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || !activeCharacterId || !activeLessonId}
              className="rounded-full bg-coral px-6 py-3 font-bold text-white transition hover:bg-[#ef7444] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? 'Activando...' : 'Activar en el peluche'}
            </button>
          </form>
        )}
      </article>

      <article className="rounded-[1.75rem] bg-white p-6 shadow-card lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
              Vista previa
            </p>
            <h2 className="mt-3 text-2xl font-extrabold">Lo que usara el peluche</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">{statusMessage}</p>
          </div>
          <span className="rounded-full bg-[#f8fbff] px-3 py-1.5 text-xs font-bold text-ink/65">
            Runtime actual
          </span>
        </div>
        <div className="mt-5 space-y-3">
          <div className="rounded-[1.25rem] border border-ink/10 p-4">
            <p className="text-sm font-bold text-ink/55">Personaje activo</p>
            <p className="mt-1 text-xl font-extrabold">
              {activeCharacter?.name ?? 'Sin seleccionar'}
            </p>
            <p className="mt-1 text-sm leading-6 text-ink/70">
              {activeCharacter
                ? `Frase de activacion: ${activeCharacter.wakePhrase}`
                : 'Selecciona un personaje para la activacion por voz.'}
            </p>
          </div>

          <div className="rounded-[1.25rem] border border-ink/10 p-4">
            <p className="text-sm font-bold text-ink/55">Leccion activa</p>
            <p className="mt-1 text-xl font-extrabold">
              {activeLesson?.topic ?? 'Sin seleccionar'}
            </p>
            <p className="mt-1 text-sm leading-6 text-ink/70">
              {activeLesson
                ? `${activeLesson.gradeLevel} · ${activeLesson.allowedVocabulary.length} palabras y expresiones clave`
                : 'Selecciona una leccion para marcar tema, objetivo y lenguaje clave.'}
            </p>
          </div>

          {activeLesson ? (
            <div className="rounded-[1.25rem] border border-ink/10 p-4">
              <p className="text-sm font-bold text-ink/55">Objetivo e idioma</p>
              <p className="mt-1 text-sm leading-6 text-ink/75">
                {activeLesson.objective}
              </p>
              <p className="mt-2 text-sm font-bold text-coral">
                {activeLesson.englishSupportAllowed
                  ? 'Espanol con apoyo breve en ingles.'
                  : 'Espanol como idioma principal de la conversacion.'}
              </p>
            </div>
          ) : null}
        </div>
      </article>
    </section>
  );
}

function getFriendlyFirestoreError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'permission-denied'
  ) {
    return 'Firestore rechazo la operacion. Publica las reglas nuevas de teacherSettings para que cada profesor pueda guardar su configuracion activa.';
  }

  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operacion con Firestore.';
}
