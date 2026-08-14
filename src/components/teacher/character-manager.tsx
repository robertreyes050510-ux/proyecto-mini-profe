'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  createTeacherCharacter,
  deleteTeacherCharacter,
  listTeacherCharacters,
  updateTeacherCharacter,
} from '@/features/teacher-config/services/character-service';
import {
  getRealtimeVoiceMeta,
  realtimeVoiceOptions,
} from '@/features/realtime/realtimeConfig';
import type {
  CharacterDraft,
  TeacherCharacterRecord,
} from '@/features/teacher-config/types/character';

const initialDraft: CharacterDraft = {
  name: '',
  personality: '',
  voiceId: 'marin',
  voiceProfile: 'warm',
  energyLevel: 'balanced',
  voiceSpeed: 1,
  wakePhrase: '',
  wakeAliases: [],
};

export function CharacterManager({ user }: { user: User }) {
  const [characters, setCharacters] = useState<TeacherCharacterRecord[]>([]);
  const [draft, setDraft] = useState<CharacterDraft>(initialDraft);
  const [wakeAliasesText, setWakeAliasesText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Cargando personajes del peluche...',
  );
  const [error, setError] = useState('');
  const [previewMessage, setPreviewMessage] = useState(
    'Pulsa el boton para escuchar una muestra corta antes de guardar.',
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
    };
  }, []);

  const refreshCharacters = useCallback(async () => {
    try {
      const nextCharacters = await listTeacherCharacters(user.uid);
      setCharacters(nextCharacters);
      setStatusMessage(
        nextCharacters.length
          ? 'Personajes listos para usarse en el peluche.'
          : 'Todavia no hay personajes. Crea el primero con su nombre y frase de activacion.',
      );
      setError('');
    } catch (loadError) {
      setError(getFriendlyFirestoreError(loadError));
      setStatusMessage('No se pudo cargar la lista de personajes.');
    }
  }, [user.uid]);

  useEffect(() => {
    void refreshCharacters();
  }, [refreshCharacters]);

  function resetForm() {
    setDraft(initialDraft);
    setWakeAliasesText('');
    setEditingId(null);
    setEditorExpanded(false);
    setPreviewMessage(
      'Pulsa el boton para escuchar una muestra corta antes de guardar.',
    );
  }

  async function handlePreviewVoice() {
    setPreviewBusy(true);
    setError('');
    setPreviewMessage('Generando muestra de voz...');

    previewAudioRef.current?.pause();

    try {
      const response = await fetch('/api/voice-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voiceId: draft.voiceId,
          voiceSpeed: draft.voiceSpeed,
          characterName: draft.name,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          payload?.error || 'No se pudo generar la muestra de voz.',
        );
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      previewAudioRef.current = audio;

      audio.addEventListener(
        'ended',
        () => {
          URL.revokeObjectURL(audioUrl);
          if (previewAudioRef.current === audio) {
            previewAudioRef.current = null;
          }
        },
        { once: true },
      );

      audio.addEventListener(
        'error',
        () => {
          URL.revokeObjectURL(audioUrl);
          if (previewAudioRef.current === audio) {
            previewAudioRef.current = null;
          }
        },
        { once: true },
      );

      await audio.play();
      setPreviewMessage(
        `Escuchando muestra de ${getRealtimeVoiceMeta(draft.voiceId).label}.`,
      );
    } catch (previewError) {
      setPreviewMessage(
        previewError instanceof Error
          ? previewError.message
          : 'No se pudo reproducir la muestra.',
      );
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const normalizedAliases = wakeAliasesText
      .split('\n')
      .map((alias) => alias.trim())
      .filter(Boolean);

    const nextDraft: CharacterDraft = {
      ...draft,
      wakeAliases: normalizedAliases,
    };

    try {
      if (editingId) {
        await updateTeacherCharacter(editingId, nextDraft);
        setStatusMessage('Personaje actualizado correctamente.');
      } else {
        await createTeacherCharacter(user.uid, nextDraft);
        setStatusMessage('Personaje creado correctamente.');
      }

      resetForm();
      await refreshCharacters();
      window.dispatchEvent(new CustomEvent('teacher-characters-updated'));
    } catch (submitError) {
      setError(getFriendlyFirestoreError(submitError));
    } finally {
      setBusy(false);
    }
  }

  function handleEdit(character: TeacherCharacterRecord) {
    setEditorExpanded(true);
    setEditingId(character.id);
    setDraft({
      name: character.name,
      personality: character.personality,
      voiceId: character.voiceId,
      voiceProfile: character.voiceProfile ?? 'warm',
      energyLevel: character.energyLevel ?? 'balanced',
      voiceSpeed: character.voiceSpeed,
      wakePhrase: character.wakePhrase,
      wakeAliases: character.wakeAliases ?? [],
    });
    setWakeAliasesText((character.wakeAliases ?? []).join('\n'));
    setStatusMessage(`Editando a ${character.name}.`);
  }

  async function handleDelete(characterId: string) {
    setBusy(true);
    setError('');

    try {
      await deleteTeacherCharacter(characterId);
      if (editingId === characterId) {
        resetForm();
      }
      setStatusMessage('Personaje eliminado correctamente.');
      await refreshCharacters();
      window.dispatchEvent(new CustomEvent('teacher-characters-updated'));
    } catch (deleteError) {
      setError(getFriendlyFirestoreError(deleteError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <article className="rounded-[1.75rem] bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
              Personajes
            </p>
            <h2 className="mt-3 text-2xl font-extrabold">
              Personalidad y voz de Paco
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink/70">
              Aqui guardas personajes reutilizables. Lo normal es tocar nombre,
              personalidad y voz; la activacion y las variantes quedan como ajuste
              avanzado cuando haga falta.
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
                setWakeAliasesText('');
              }}
              className="rounded-full border border-ink/10 px-4 py-2.5 text-sm font-bold text-ink transition hover:border-coral hover:text-coral"
            >
              Nuevo personaje
            </button>
          </div>
        </div>

        {!editorExpanded ? (
          <div className="mt-5 rounded-[1.25rem] border border-dashed border-ink/15 p-4 text-sm leading-6 text-ink/60">
            La biblioteca queda visible por defecto. Abre el editor solo cuando
            quieras crear o corregir un personaje.
          </div>
        ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-ink/70">
              Nombre del personaje
            </span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
              placeholder="Paco"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-ink/70">
              Personalidad
            </span>
            <textarea
              value={draft.personality}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  personality: event.target.value,
                }))
              }
              className="min-h-24 w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
              placeholder="Alegre, paciente y motivador."
              required
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink/70">
                Voz
              </span>
              <select
                value={draft.voiceId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    voiceId: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
                required
              >
                {realtimeVoiceOptions.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label} · {voice.description}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-ink/55">
                Elige la voz que usara el personaje en la sesion Realtime.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handlePreviewVoice()}
                  disabled={previewBusy}
                  className="rounded-full border border-coral px-4 py-2 text-sm font-bold text-coral transition hover:bg-[#fff1eb] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {previewBusy ? 'Escuchando muestra...' : 'Escuchar muestra'}
                </button>
                <span className="text-sm text-ink/60">{previewMessage}</span>
              </div>
              <p className="mt-2 text-sm text-ink/55">
                No usamos voces de famosos. Si quieres, elegimos un estilo:
                cuentacuentos, traviesa, firme, dulce o teatral.
              </p>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-ink/70">
                Velocidad de voz
              </span>
              <input
                type="number"
                min="0.5"
                max="1.5"
                step="0.1"
                value={draft.voiceSpeed}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    voiceSpeed: Number(event.target.value),
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-[#fcfdfd] px-4 py-3 outline-none transition focus:border-coral"
                required
              />
            </label>
          </div>

          <details className="rounded-[1.25rem] border border-ink/10 bg-[#fcfdfd] px-5 py-4">
            <summary className="cursor-pointer list-none text-base font-bold text-ink">
              Configuracion avanzada del personaje
            </summary>
            <p className="mt-3 text-sm leading-6 text-ink/60">
              Usa esto solo cuando quieras ajustar activacion o comportamiento fino
              del reconocimiento de voz.
            </p>

            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-ink/70">
                  Frase de activacion
                </span>
                <input
                  type="text"
                  value={draft.wakePhrase}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      wakePhrase: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-coral"
                  placeholder="Hola Paco"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-ink/70">
                  Variantes aceptadas del nombre
                </span>
                <textarea
                  value={wakeAliasesText}
                  onChange={(event) => setWakeAliasesText(event.target.value)}
                  className="min-h-28 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-coral"
                  placeholder={'Sasa\nSasha\nZaza'}
                />
                <p className="mt-2 text-sm text-ink/55">
                  Escribe una variante por linea para cubrir confusiones comunes del microfono.
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
                ? 'Guardar personaje'
                : 'Crear personaje'}
          </button>
        </form>
        )}
      </article>

      <article className="rounded-[1.75rem] bg-white p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
          Biblioteca del profesor
        </p>
        <h2 className="mt-3 text-2xl font-extrabold">Personajes guardados</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">{statusMessage}</p>
        <div className="mt-5 space-y-3">
          {characters.length ? (
            characters.map((character) => (
              <div
                key={character.id}
                className="rounded-[1.25rem] border border-ink/10 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-bold text-ink/55">Nombre</p>
                      <p className="text-xl font-extrabold">{character.name}</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink/55">
                        Frase de activacion
                      </p>
                      <p className="text-lg font-bold text-coral">
                        {character.wakePhrase}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink/55">
                        Variantes aceptadas
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {character.wakeAliases?.length ? (
                          character.wakeAliases.map((alias) => (
                            <span
                              key={alias}
                              className="rounded-full bg-[#eef9ff] px-3 py-1 text-sm font-bold text-[#2d6d96]"
                            >
                              {alias}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-ink/60">
                            Sin variantes adicionales.
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink/55">Personalidad</p>
                      <p className="text-base leading-7 text-ink/75">
                        {character.personality}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                        <p className="text-sm font-bold text-ink/55">Voz</p>
                        <p className="mt-1 font-bold">
                          {getRealtimeVoiceMeta(character.voiceId).label}
                        </p>
                        <p className="text-sm text-ink/55">
                          {getRealtimeVoiceMeta(character.voiceId).description}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                        <p className="text-sm font-bold text-ink/55">Velocidad</p>
                        <p className="mt-1 font-bold">{character.voiceSpeed}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(character)}
                      className="rounded-full border border-ink/10 px-4 py-2 text-sm font-bold text-ink transition hover:border-coral hover:text-coral"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(character.id)}
                      className="rounded-full border border-[#f2c1b5] px-4 py-2 text-sm font-bold text-[#b84e28] transition hover:bg-[#fff1eb]"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-ink/15 p-6 text-base leading-7 text-ink/60">
              Cuando crees el primer personaje, apareceran aqui su nombre, voz y
              frase de activacion.
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
    return 'Firestore rechazo la operacion. Publica las reglas nuevas de characters para que cada profesor pueda guardar solo sus propios datos.';
  }

  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operacion con Firestore.';
}
