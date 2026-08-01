import { describe, expect, it } from 'vitest';
import {
  defaultRealtimeTurnDetection,
  getRealtimeModel,
  getVoiceMode,
} from '@/features/realtime/realtimeConfig';

describe('realtimeConfig', () => {
  it('provides conservative classroom turn detection defaults', () => {
    expect(defaultRealtimeTurnDetection.type).toBe('server_vad');
    expect(defaultRealtimeTurnDetection.silenceDurationMs).toBeGreaterThanOrEqual(900);
    expect(defaultRealtimeTurnDetection.prefixPaddingMs).toBeGreaterThan(0);
    expect(defaultRealtimeTurnDetection.interruptResponse).toBe(true);
  });

  it('returns safe env defaults when no env vars are present', () => {
    expect(getRealtimeModel()).toBeTruthy();
    expect(getVoiceMode()).toBeTruthy();
  });
});
