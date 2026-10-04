import { describe, expect, it } from 'vitest';
import {
  isDirectedAtCharacter,
  isMeaningfulUserSpeech,
} from '@/features/realtime/turnPolicy';

describe('realtime turn policy', () => {
  it('ignores empty and noise-only transcripts', () => {
    expect(isMeaningfulUserSpeech('ruido')).toBe(false);
    expect(isMeaningfulUserSpeech('   ')).toBe(false);
    expect(isMeaningfulUserSpeech('llaves en el suelo')).toBe(true);
  });

  it('recognizes a direct request for the character without matching partial names', () => {
    const character = {
      characterName: 'Zaza',
      wakeAliases: ['Sasa'],
    };

    expect(isDirectedAtCharacter({ ...character, transcript: 'Zaza, que significa eso?' })).toBe(
      true,
    );
    expect(isDirectedAtCharacter({ ...character, transcript: 'Sasa continua el cuento' })).toBe(
      true,
    );
    expect(isDirectedAtCharacter({ ...character, transcript: 'La taza es azul' })).toBe(false);
  });
});
