import { describe, expect, it } from 'vitest';
import { buildSessionInstructions } from '@/features/realtime/buildSessionInstructions';

describe('buildSessionInstructions', () => {
  it('builds warm spanish-first instructions from normalized config', () => {
    const result = buildSessionInstructions({
      character: {
        name: 'Sasa',
        personality: 'calida y divertida',
        wakePhrase: 'Hola Sasa',
        wakeAliases: ['Sasha'],
        voiceId: 'marin',
        voiceProfile: 'playful',
        energyLevel: 'high',
        voiceSpeed: 1.1,
      },
      lesson: {
        gradeLevel: '3',
        approximateAge: '8-9',
        spanishLevel: 'developing',
        topic: 'Animales',
        objective: 'Hablar de mascotas y preferencias',
        allowedVocabulary: ['perro', 'gato'],
        priorityGrammarStructures: ['me gusta', 'tengo'],
        culturalContext: 'vida cotidiana en casa',
        supportPhrases: ['Intentalo otra vez'],
        responseMode: 'guided',
        freedomLevel: 'high',
        correctionIntensity: 'medium',
        englishSupportAllowed: true,
        responseLength: 'medium',
        avoidTopics: ['violencia'],
        teacherSpecialInstructions: 'Favorece ejemplos de mascotas.',
        englishFallbackText:
          'En espanol lo decimos asi. Escucha y luego intentalo conmigo otra vez.',
      },
    });

    expect(result.text).toContain('Eres Sasa.');
    expect(result.text).toContain('Tema actual: Animales.');
    expect(result.text).toContain('Hablas como un companero de conversacion escolar');
    expect(result.text).toContain('Evita estos temas si aparecen: violencia.');
    expect(result.text).toContain('Puedes usar apoyo breve en ingles');
    expect(result.normalized.lesson.allowedVocabulary).toEqual(['perro', 'gato']);
  });

  it('falls back to safe defaults when values are missing or malformed', () => {
    const result = buildSessionInstructions({
      character: {
        name: ' ',
        voiceSpeed: 99,
      },
      lesson: {
        topic: ' ',
        objective: ' ',
        allowedVocabulary: ['hola', '', 'hola'],
        spanishLevel: 'unknown' as never,
      },
    });

    expect(result.normalized.character.name).toBe('Mini Profe');
    expect(result.normalized.character.voiceSpeed).toBe(1.4);
    expect(result.normalized.lesson.topic).toBe('Conversacion guiada en espanol');
    expect(result.normalized.lesson.objective).toBe(
      'Ayudar al estudiante a usar el espanol con confianza.',
    );
    expect(result.normalized.lesson.allowedVocabulary).toEqual(['hola']);
  });
});
