'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  createTeacherLesson,
  deleteTeacherLesson,
  listTeacherLessons,
  updateTeacherLesson,
} from '@/features/teacher-config/services/lesson-service';
import type {
  LessonDraft,
  TeacherLessonRecord,
} from '@/features/teacher-config/types/lesson';
import type {
  GradeLevel,
  LessonFreedomLevel,
  LessonResponseMode,
} from '@/types/domain';

const gradeLevels: GradeLevel[] = ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8'];
const responseModes: Array<{ value: LessonResponseMode; label: string }> = [
  { value: 'strict', label: 'Estricto' },
  { value: 'guided', label: 'Guiado' },
];
const freedomLevels: Array<{ value: LessonFreedomLevel; label: string }> = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
];

const initialDraft: LessonDraft = {
  gradeLevel: 'Pre-K',
  approximateAge: '5-6',
  spanishLevel: 'beginner',
  topic: '',
  objective: '',
  allowedVocabulary: [],
  priorityGrammarStructures: [],
  culturalContext: '',
  supportPhrases: [],
  responseMode: 'strict',
  freedomLevel: 'low',
  correctionIntensity: 'medium',
  englishSupportAllowed: true,
  responseLength: 'short',
  avoidTopics: [],
  teacherSpecialInstructions: '',
  maxResponseSentences: 2,
  maxQuestionsPerTurn: 1,
  englishFallbackText:
    'En espanol lo decimos asi. Escucha y luego intentalo conmigo otra vez.',
};

export function LessonManager({ user }: { user: User }) {
  const libraryPreviewCount = 4;
  const [lessons, setLessons] = useState<TeacherLessonRecord[]>([]);
  const [draft, setDraft] = useState<LessonDraft>(initialDraft);
  const [vocabularyText, setVocabularyText] = useState('');
  const [supportPhrasesText, setSupportPhrasesText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Cargando lecciones del profesor...',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshLessons = useCallback(async () => {
    try {
      const nextLessons = await listTeacherLessons(user.uid);
      setLessons(nextLessons);
      setStatusMessage(
        nextLessons.length
          ? 'Lecciones listas para asignarse al peluche.'
          : 'Todavia no hay lecciones. Crea la primera con tema, nivel y vocabulario permitido.',
      );
      setError('');
    } catch (loadError) {
      setError(getFriendlyFirestoreError(loadError));
      setStatusMessage('No se pudo cargar la lista de lecciones.');
    }
  }, [user.uid]);

  useEffect(() => {
    void refreshLessons();
  }, [refreshLessons]);

  const visibleLessons = libraryExpanded
    ? lessons
    : lessons.slice(0, libraryPreviewCount);
  const hiddenLessonsCount = Math.max(lessons.length - libraryPreviewCount, 0);

  function resetForm() {
    setDraft(initialDraft);
    setVocabularyText('');
    setSupportPhrasesText('');
    setEditingId(null);
    setEditorExpanded(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const normalizedVocabulary = vocabularyText
      .split('\n')
      .map((word) => word.trim())
      .filter(Boolean);
    const normalizedSupportPhrases = supportPhrasesText
      .split('\n')
      .map((phrase) => phrase.trim())
      .filter(Boolean);

    const nextDraft: LessonDraft = {
      ...draft,
      allowedVocabulary: normalizedVocabulary,
      supportPhrases: normalizedSupportPhrases,
    };

    try {
      if (editingId) {
        await updateTeacherLesson(editingId, nextDraft);
        setStatusMessage('Leccion actualizada correctamente.');
      } else {
        await createTeacherLesson(user.uid, nextDraft);
        setStatusMessage('Leccion creada correctamente.');
      }

      resetForm();
      await refreshLessons();
    } catch (submitError) {
      setError(getFriendlyFirestoreError(submitError));
    } finally {
      setBusy(false);
    }
  }

  function handleEdit(lesson: TeacherLessonRecord) {
    setEditorExpanded(true);
    setEditingId(lesson.id);
    setDraft({
      gradeLevel: lesson.gradeLevel,
      topic: lesson.topic,
      objective: lesson.objective,
      allowedVocabulary: lesson.allowedVocabulary,
      approximateAge: lesson.approximateAge ?? '5-6',
      spanishLevel: lesson.spanishLevel ?? 'beginner',
      priorityGrammarStructures: lesson.priorityGrammarStructures ?? [],
      culturalContext: lesson.culturalContext ?? '',
      supportPhrases: lesson.supportPhrases ?? [],
      responseMode: lesson.responseMode ?? 'strict',
      freedomLevel: lesson.freedomLevel ?? 'low',
      correctionIntensity: lesson.correctionIntensity ?? 'medium',
      englishSupportAllowed: lesson.englishSupportAllowed ?? false,
      responseLength: lesson.responseLength ?? 'short',
      avoidTopics: lesson.avoidTopics ?? [],
      teacherSpecialInstructions: lesson.teacherSpecialInstructions ?? '',
      maxResponseSentences: lesson.maxResponseSentences,
      maxQuestionsPerTurn: lesson.maxQuestionsPerTurn,
      englishFallbackText: lesson.englishFallbackText,
    });
    setVocabularyText(lesson.allowedVocabulary.join('\n'));
    setSupportPhrasesText((lesson.supportPhrases ?? []).join('\n'));
    setStatusMessage(`Editando la leccion ${lesson.topic}.`);
  }

  async function handleDelete(lessonId: string) {
    setBusy(true);
    setError('');

    try {
      await deleteTeacherLesson(lessonId);
      if (editingId === lessonId) {
        resetForm();
      }
      setStatusMessage('Leccion eliminada correctamente.');
      await refreshLessons();
    } catch (deleteError) {
      setError(getFriendlyFirestoreError(deleteError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <article className="rounded-[1.75rem] bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
              Lecciones
            </p>
            <h2 className="mt-3 text-2xl font-extrabold">
              Prepara el contenido de hoy
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink/70">
              Esta pantalla deberia resolver casi todo lo diario: grupo, tema,
              objetivo, palabras clave, apoyo de idioma y libertad conversacional.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {editorExpanded ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-ink/10 px-4 py-2.5 text-sm font-bold text-ink transition hover:border-coral hover:text-coral"
              >
                Cerrar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setEditorExpanded(true);
                setEditingId(null);
                setDraft(initialDraft);
                setVocabularyText('');
                setSupportPhrasesText('');
              }}
              className="rounded-full border border-ink/10 px-4 py-2.5 text-sm font-bold text-ink transition hover:border-coral hover:text-coral"
            >
              + Nueva leccion
            </button>
          </div>
        </div>

        {!editorExpanded ? (
          <div className="mt-5 rounded-[1.25rem] border border-dashed border-ink/15 p-4 text-sm leading-6 text-ink/60">
            La biblioteca queda visible por defecto. Abre el editor solo cuando
            quieras crear o corregir una leccion.
          </div>
        ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink/70">
                Grupo o nivel
              </span>
              <select
                value={draft.gradeLevel}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    gradeLevel: event.target.value as GradeLevel,
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
              >
                {gradeLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink/70">
                Tema
              </span>
              <input
                type="text"
                value={draft.topic}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, topic: event.target.value }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
                placeholder="Animales"
                required
              />
            </label>
          </div>

          <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink/70">
                Objetivo de hoy
              </span>
            <textarea
              value={draft.objective}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  objective: event.target.value,
                }))
              }
              className="min-h-20 w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
              placeholder="Reconocer y pronunciar nombres de animales en espanol."
              required
            />
          </label>

          <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink/70">
              Palabras y expresiones clave
            </span>
            <textarea
              value={vocabularyText}
              onChange={(event) => setVocabularyText(event.target.value)}
              className="min-h-28 w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
              placeholder={'perro\ngato\nconejo\nvaca\ncaballo'}
              required
            />
            <p className="mt-2 text-sm text-ink/55">
              Escribe una por linea. Esto marca el lenguaje que quieres empujar hoy.
            </p>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-ink/70">
              Frases que quiero reforzar
            </span>
            <textarea
              value={supportPhrasesText}
              onChange={(event) => setSupportPhrasesText(event.target.value)}
              className="min-h-24 w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
              placeholder={'Muy bien\nIntentalo otra vez\nEn espanol decimos...\nExcelente trabajo'}
            />
            <p className="mt-2 text-sm text-ink/55">
              Sirven para que Paco repita expresiones utiles con naturalidad.
            </p>
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink/70">
                Estilo de respuesta
              </span>
              <select
                value={draft.responseMode}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    responseMode: event.target.value as LessonResponseMode,
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
              >
                {responseModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink/70">
                Libertad de conversacion
              </span>
              <select
                value={draft.freedomLevel}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    freedomLevel: event.target.value as LessonFreedomLevel,
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
              >
                {freedomLevels.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-4">
            <input
              type="checkbox"
              checked={draft.englishSupportAllowed}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  englishSupportAllowed: event.target.checked,
                }))
              }
              className="mt-1 h-5 w-5 rounded border border-ink/20 text-coral focus:ring-coral"
            />
            <span className="block">
              <span className="block text-sm font-bold text-ink/70">
                Espanol con apoyo breve en ingles
              </span>
              <span className="mt-1 block text-sm leading-6 text-ink/55">
                Util cuando los ninos aun no entienden suficiente espanol. Paco
                puede aclarar algo en ingles y volver al espanol enseguida.
              </span>
            </span>
          </label>

          <details className="rounded-[1.25rem] border border-ink/10 bg-[#fcfdfd] px-5 py-4">
            <summary className="cursor-pointer list-none text-base font-bold text-ink">
              Configuracion avanzada de la leccion
            </summary>
            <p className="mt-3 text-sm leading-6 text-ink/60">
              Aqui quedan los limites y ajustes pedagogicos finos que no deberias
              tocar cada manana.
            </p>

            <div className="mt-5 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-ink/70">
                    Maximo de oraciones
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="2"
                    step="1"
                    value={draft.maxResponseSentences}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        maxResponseSentences: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-coral"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-ink/70">
                    Maximo de preguntas
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="1"
                    value={draft.maxQuestionsPerTurn}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        maxQuestionsPerTurn: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-coral"
                    required
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-ink/70">
                  Apoyo breve cuando el alumno hable ingles
                </span>
                <input
                  type="text"
                  value={draft.englishFallbackText}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      englishFallbackText: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-coral"
                  placeholder="En espanol lo decimos asi. Escucha y luego intentalo conmigo otra vez."
                  required
                />
                <p className="mt-2 text-sm text-ink/55">
                  Este texto se usa cuando quieres una ayuda corta y amable.
                </p>
              </label>
            </div>
          </details>

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
              ? 'Guardando...'
              : editingId
                ? 'Guardar leccion'
                : 'Crear leccion'}
          </button>
        </form>
        )}
      </article>

      <article className="rounded-[1.75rem] bg-white p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
          Biblioteca curricular
        </p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold">Lecciones guardadas</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">{statusMessage}</p>
          </div>
          {hiddenLessonsCount > 0 ? (
            <button
              type="button"
              onClick={() => setLibraryExpanded((current) => !current)}
              className="rounded-full border border-ink/10 px-4 py-2.5 text-sm font-bold text-ink transition hover:border-coral hover:text-coral"
            >
              {libraryExpanded
                ? 'Mostrar menos'
                : `Ver ${hiddenLessonsCount} mas`}
            </button>
          ) : null}
        </div>
        <div className="mt-5 space-y-3">
          {lessons.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleLessons.map((lesson) => (
                <details
                  key={lesson.id}
                  className="rounded-[1.25rem] border border-ink/10 p-4"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div>
                          <p className="text-sm font-bold text-ink/55">Tema</p>
                          <p className="text-xl font-extrabold">{lesson.topic}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                            <p className="text-sm font-bold text-ink/55">Nivel</p>
                            <p className="mt-1 font-bold">{lesson.gradeLevel}</p>
                          </div>
                          <div className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                            <p className="text-sm font-bold text-ink/55">Modo</p>
                            <p className="mt-1 font-bold">
                              {formatResponseMode(lesson.responseMode)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                            <p className="text-sm font-bold text-ink/55">Libertad</p>
                            <p className="mt-1 font-bold">
                              {formatFreedomLevel(lesson.freedomLevel)}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-ink/55">Objetivo</p>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink/75">
                            {lesson.objective}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            handleEdit(lesson);
                          }}
                          className="rounded-full border border-ink/10 px-4 py-2 text-sm font-bold text-ink transition hover:border-coral hover:text-coral"
                        >
                          Editar
                        </button>
                        <span className="text-sm font-bold text-coral">
                          Ver detalles
                        </span>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-4 space-y-4 border-t border-ink/10 pt-4">
                    <div>
                      <p className="text-sm font-bold text-ink/55">
                        Palabras y expresiones clave
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {lesson.allowedVocabulary.map((word) => (
                          <span
                            key={word}
                            className="rounded-full bg-[#fff1eb] px-3 py-1 text-sm font-bold text-coral"
                          >
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-ink/55">
                        Frases que quiero reforzar
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {lesson.supportPhrases?.length ? (
                          lesson.supportPhrases.map((phrase) => (
                            <span
                              key={phrase}
                              className="rounded-full bg-[#eef9ff] px-3 py-1 text-sm font-bold text-[#2d6d96]"
                            >
                              {phrase}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-ink/60">
                            No hay frases de apoyo configuradas.
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-ink/55">Fallback de ingles</p>
                      <p className="mt-1 text-sm leading-6 text-ink/75">
                        {lesson.englishFallbackText}
                      </p>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleDelete(lesson.id)}
                        className="rounded-full border border-[#f2c1b5] px-4 py-2 text-sm font-bold text-[#b84e28] transition hover:bg-[#fff1eb]"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-ink/15 p-6 text-base leading-7 text-ink/60">
              Cuando crees la primera leccion, apareceran aqui el tema, el nivel y
              el vocabulario permitido.
            </div>
          )}
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
    return 'Firestore rechazo la operacion. Publica las reglas nuevas de lessons para que cada profesor pueda guardar solo sus propias lecciones.';
  }

  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operacion con Firestore.';
}

function formatResponseMode(mode?: LessonResponseMode) {
  switch (mode) {
    case 'guided':
      return 'Guiado';
    case 'strict':
    default:
      return 'Estricto';
  }
}

function formatFreedomLevel(level?: LessonFreedomLevel) {
  switch (level) {
    case 'high':
      return 'Alta';
    case 'medium':
      return 'Media';
    case 'low':
    default:
      return 'Baja';
  }
}
