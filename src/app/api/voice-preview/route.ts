import { NextResponse } from 'next/server';
import {
  getRealtimeVoiceMeta,
  mapTeacherVoiceToRealtimeVoice,
} from '@/features/realtime/realtimeConfig';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';

type VoicePreviewRequest = {
  voiceId?: string;
  voiceSpeed?: number;
  characterName?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoicePreviewRequest;
    const voiceId = mapTeacherVoiceToRealtimeVoice(body.voiceId);
    const speed = clampPreviewSpeed(body.voiceSpeed);
    const characterName = normalizeName(body.characterName);
    const prompt = buildPreviewText(characterName, voiceId);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Falta OPENAI_API_KEY en el servidor. Agregala para escuchar muestras de voz.',
        },
        { status: 500 },
      );
    }

    const response = await fetch(OPENAI_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: voiceId,
        input: prompt,
        response_format: 'mp3',
        speed,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: `OpenAI devolvio ${response.status}. ${errorText || 'No se pudo generar la muestra de voz.'}`,
        },
        { status: response.status },
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Voice-Label': getRealtimeVoiceMeta(voiceId).label,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo generar la muestra de voz.',
      },
      { status: 500 },
    );
  }
}

function buildPreviewText(characterName: string, voiceId: string) {
  const voiceMeta = getRealtimeVoiceMeta(voiceId);

  return [
    `Hola, soy ${characterName}.`,
    `Esta es una muestra corta de la voz ${voiceMeta.label}.`,
    'Vamos a aprender espanol juntos con energia y calma.',
  ].join(' ');
}

function clampPreviewSpeed(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 1;
  }

  return Math.min(1.5, Math.max(0.7, value));
}

function normalizeName(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || 'tu peluche';
}
