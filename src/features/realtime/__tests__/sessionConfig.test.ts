import { describe, expect, it } from 'vitest';
import {
  mapTeacherVoiceToRealtimeVoice,
  toRealtimeTurnDetectionConfig,
} from '@/features/realtime/realtimeConfig';

describe('mapTeacherVoiceToRealtimeVoice', () => {
  it('keeps supported realtime voices', () => {
    expect(mapTeacherVoiceToRealtimeVoice('cedar')).toBe('cedar');
  });

  it('maps unknown teacher voices to a safe default', () => {
    expect(mapTeacherVoiceToRealtimeVoice('es-US-1')).toBe('marin');
  });
});

describe('toRealtimeTurnDetectionConfig', () => {
  it('translates camelCase config to the API field shape', () => {
    expect(
      toRealtimeTurnDetectionConfig({
        type: 'server_vad',
        threshold: 0.6,
        silenceDurationMs: 1200,
        prefixPaddingMs: 250,
        createResponse: true,
        interruptResponse: true,
      }),
    ).toEqual({
      type: 'server_vad',
      threshold: 0.6,
      silence_duration_ms: 1200,
      prefix_padding_ms: 250,
      create_response: true,
      interrupt_response: true,
    });
  });
});
