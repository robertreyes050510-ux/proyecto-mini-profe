import type { RealtimeTurnDetectionConfig } from '@/features/realtime/realtimeTypes';

export const defaultRealtimeTurnDetection: RealtimeTurnDetectionConfig = {
  type: 'server_vad',
  threshold: 0.55,
  silenceDurationMs: 950,
  prefixPaddingMs: 300,
  createResponse: true,
  interruptResponse: true,
};

export const realtimeVoices = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as const;

export type SupportedRealtimeVoice = (typeof realtimeVoices)[number];

export const realtimeVoiceOptions: Array<{
  id: SupportedRealtimeVoice;
  label: string;
  description: string;
}> = [
  {
    id: 'marin',
    label: 'Marin',
    description: 'Calida, clara y muy estable para clase.',
  },
  {
    id: 'cedar',
    label: 'Cedar',
    description: 'Serena, suave y relajada.',
  },
  {
    id: 'coral',
    label: 'Coral',
    description: 'Alegre, chispeante y juguetona.',
  },
  {
    id: 'sage',
    label: 'Sage',
    description: 'Dulce, suave y paciente.',
  },
  {
    id: 'verse',
    label: 'Verse',
    description: 'Conversacional, agil y natural.',
  },
  {
    id: 'ballad',
    label: 'Ballad',
    description: 'Cuentacuentos, amable y expresiva.',
  },
  {
    id: 'ash',
    label: 'Ash',
    description: 'Directa, firme y moderna.',
  },
  {
    id: 'alloy',
    label: 'Alloy',
    description: 'Equilibrada y versatil.',
  },
  {
    id: 'echo',
    label: 'Echo',
    description: 'Marcada, energica y teatral.',
  },
  {
    id: 'shimmer',
    label: 'Shimmer',
    description: 'Brillante, ligera y traviesa.',
  },
];

export function getRealtimeModel() {
  return process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
}

export function getRealtimeTranscriptionModel() {
  return process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
}

export function getVoiceMode() {
  return process.env.NEXT_PUBLIC_VOICE_MODE || 'realtime';
}

export function getRealtimeSessionMaxMs() {
  return 12 * 60 * 1000;
}

export function getRealtimeHiddenPageTimeoutMs() {
  return 45 * 1000;
}

export function mapTeacherVoiceToRealtimeVoice(voiceId: string | null | undefined) {
  const normalized = (voiceId || '').trim().toLowerCase() as SupportedRealtimeVoice;

  if (realtimeVoices.includes(normalized)) {
    return normalized;
  }

  if (normalized.includes('calm') || normalized.includes('soft')) {
    return 'cedar';
  }

  if (normalized.includes('play') || normalized.includes('fun')) {
    return 'coral';
  }

  return 'marin';
}

export function getRealtimeVoiceMeta(voiceId: string | null | undefined) {
  const resolvedId = mapTeacherVoiceToRealtimeVoice(voiceId);

  return (
    realtimeVoiceOptions.find((voice) => voice.id === resolvedId) ?? realtimeVoiceOptions[0]
  );
}

export function toRealtimeTurnDetectionConfig(
  config: RealtimeTurnDetectionConfig = defaultRealtimeTurnDetection,
) {
  return {
    type: config.type,
    threshold: config.threshold,
    silence_duration_ms: config.silenceDurationMs,
    prefix_padding_ms: config.prefixPaddingMs,
    create_response: config.createResponse,
    interrupt_response: config.interruptResponse,
  };
}
