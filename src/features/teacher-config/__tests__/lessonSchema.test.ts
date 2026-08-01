import { describe, expect, it } from 'vitest';
import {
  lessonConfigDefaults,
  normalizeLessonConfig,
  validateLessonConfig,
} from '@/features/teacher-config/lessonSchema';

describe('lessonSchema', () => {
  it('normalizes malformed lesson config with defaults', () => {
    const result = normalizeLessonConfig({
      topic: '  Saludos  ',
      objective: '  ',
      allowedVocabulary: ['hola', '', 'hola'],
      responseLength: 'invalid' as never,
      correctionIntensity: 'invalid' as never,
      englishSupportAllowed: 'yes' as never,
      maxResponseSentences: 99,
    });

    expect(result.topic).toBe('Saludos');
    expect(result.objective).toBe('');
    expect(result.allowedVocabulary).toEqual(['hola']);
    expect(result.responseLength).toBe(lessonConfigDefaults.responseLength);
    expect(result.correctionIntensity).toBe(lessonConfigDefaults.correctionIntensity);
    expect(result.englishSupportAllowed).toBe(true);
    expect(result.maxResponseSentences).toBe(4);
  });

  it('rejects incomplete lesson config', () => {
    const issues = validateLessonConfig({
      topic: '',
      objective: '',
      allowedVocabulary: [],
      englishFallbackText: '',
    });

    expect(issues).toContain('Falta el tema de la leccion.');
    expect(issues).toContain('Falta el objetivo comunicativo de la leccion.');
    expect(issues).toContain('Debe existir al menos una palabra de vocabulario prioritario.');
    expect(issues).toContain('Falta el fallback para apoyo en ingles.');
  });
});
