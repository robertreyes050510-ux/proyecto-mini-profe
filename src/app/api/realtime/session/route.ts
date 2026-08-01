import { NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { buildSessionInstructions } from '@/features/realtime/buildSessionInstructions';
import {
  defaultRealtimeTurnDetection,
  getRealtimeModel,
  getRealtimeSessionMaxMs,
  getRealtimeTranscriptionModel,
  mapTeacherVoiceToRealtimeVoice,
  toRealtimeTurnDetectionConfig,
} from '@/features/realtime/realtimeConfig';
import type { StudentRuntimeConfig } from '@/features/teacher-config/types/student-runtime';

const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const STUDENT_RUNTIME_COLLECTION = 'studentRuntime';
const DEFAULT_RUNTIME_DOC = 'default';

type SessionRequestBody = {
  deviceId?: string;
  offerSdp?: string;
  runtime?: Partial<StudentRuntimeConfig> | null;
};

type ActiveSessionEntry = {
  callId: string | null;
  startedAt: number;
};

const globalSessionRegistry = globalThis as typeof globalThis & {
  __miniProfeRealtimeSessions?: Map<string, ActiveSessionEntry>;
};

const activeRealtimeSessions =
  globalSessionRegistry.__miniProfeRealtimeSessions ||
  new Map<string, ActiveSessionEntry>();

globalSessionRegistry.__miniProfeRealtimeSessions = activeRealtimeSessions;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SessionRequestBody;
    const validationError = validateSessionRequest(body);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const deviceId = body.deviceId!.trim();
    releaseExpiredSession(deviceId);

    if (activeRealtimeSessions.has(deviceId)) {
      return NextResponse.json(
        {
          error:
            'Ya existe una sesion realtime activa para este dispositivo. Cierra la sesion anterior antes de abrir otra.',
        },
        { status: 409 },
      );
    }

    const runtime = await resolveRuntimeConfig(body.runtime);

    if (!runtime) {
      return NextResponse.json(
        {
          error:
            'No se encontro una configuracion activa del peluche para abrir la sesion realtime.',
        },
        { status: 404 },
      );
    }

    const builtInstructions = buildSessionInstructions({
      character: runtime.activeCharacter,
      lesson: runtime.activeLesson,
    });
    const voice = mapTeacherVoiceToRealtimeVoice(runtime.activeCharacter.voiceId);
    const sessionPayload = {
      type: 'realtime',
      model: getRealtimeModel(),
      output_modalities: ['audio'],
      max_output_tokens: 380,
      instructions: builtInstructions.text,
      audio: {
        input: {
          noise_reduction: {
            type: 'far_field',
          },
          transcription: {
            model: getRealtimeTranscriptionModel(),
            language: 'es',
            prompt: buildTranscriptionPrompt(runtime),
          },
          turn_detection: toRealtimeTurnDetectionConfig(defaultRealtimeTurnDetection),
        },
        output: {
          voice,
          speed: clampVoiceSpeed(runtime.activeCharacter.voiceSpeed),
        },
      },
    };

    const openAiResponse = await createRealtimeCall({
      offerSdp: body.offerSdp!,
      sessionPayload,
    });

    activeRealtimeSessions.set(deviceId, {
      callId: openAiResponse.callId,
      startedAt: Date.now(),
    });

    return NextResponse.json({
      answerSdp: openAiResponse.answerSdp,
      callId: openAiResponse.callId,
      model: sessionPayload.model,
      voice,
      expiresAt: new Date(Date.now() + getRealtimeSessionMaxMs()).toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo crear la sesion Realtime.',
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      callId?: string | null;
      deviceId?: string;
    };

    const deviceId = body.deviceId?.trim();

    if (deviceId) {
      activeRealtimeSessions.delete(deviceId);
    }

    if (body.callId?.trim()) {
      await hangupRealtimeCall(body.callId.trim());
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

function validateSessionRequest(body: SessionRequestBody) {
  if (!body.deviceId?.trim()) {
    return 'Falta el identificador del dispositivo.';
  }

  if (!body.offerSdp?.trim()) {
    return 'Falta la oferta WebRTC del navegador.';
  }

  return null;
}

async function resolveRuntimeConfig(
  runtimeFromClient: Partial<StudentRuntimeConfig> | null | undefined,
) {
  const adminDb = getFirebaseAdminDb();

  if (adminDb) {
    const snapshot = await adminDb
      .collection(STUDENT_RUNTIME_COLLECTION)
      .doc(DEFAULT_RUNTIME_DOC)
      .get();

    if (snapshot.exists) {
      return snapshot.data() as StudentRuntimeConfig;
    }
  }

  if (runtimeFromClient?.activeCharacter && runtimeFromClient.activeLesson) {
    return runtimeFromClient as StudentRuntimeConfig;
  }

  return null;
}

async function createRealtimeCall(input: {
  offerSdp: string;
  sessionPayload: Record<string, unknown>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Falta OPENAI_API_KEY en el servidor. Sin esa clave no podemos abrir la sesion realtime.',
    );
  }

  const formData = new FormData();
  formData.append('sdp', input.offerSdp);
  formData.append('session', JSON.stringify(input.sessionPayload));

  const response = await fetch(OPENAI_REALTIME_CALLS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const answerSdp = await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenAI devolvio ${response.status}. ${sanitizeOpenAiError(answerSdp)}`,
    );
  }

  return {
    answerSdp,
    callId: extractCallId(response.headers.get('location')),
  };
}

async function hangupRealtimeCall(callId: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return;
  }

  await fetch(`${OPENAI_REALTIME_CALLS_URL}/${callId}/hangup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }).catch(() => undefined);
}

function extractCallId(locationHeader: string | null) {
  if (!locationHeader) {
    return null;
  }

  const segments = locationHeader.split('/').filter(Boolean);
  return segments.at(-1) || null;
}

function sanitizeOpenAiError(text: string) {
  return text.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').trim();
}

function clampVoiceSpeed(speed: number) {
  if (typeof speed !== 'number' || Number.isNaN(speed)) {
    return 1;
  }

  return Math.max(0.8, Math.min(1.4, speed));
}
function buildTranscriptionPrompt(runtime: StudentRuntimeConfig) {
  return [
    `Nombre del personaje: ${runtime.activeCharacter.name}.`,
    `Frase de activacion historica: ${runtime.activeCharacter.wakePhrase}.`,
    `Tema de clase: ${runtime.activeLesson.topic}.`,
    `Vocabulario prioritario: ${runtime.activeLesson.allowedVocabulary.join(', ') || 'sin lista'}.`,
    'Transcribe en espanol cuando sea posible y conserva nombres propios cercanos al personaje.',
  ].join(' ');
}

function releaseExpiredSession(deviceId: string) {
  const current = activeRealtimeSessions.get(deviceId);

  if (!current) {
    return;
  }

  if (Date.now() - current.startedAt > getRealtimeSessionMaxMs()) {
    activeRealtimeSessions.delete(deviceId);
  }
}
