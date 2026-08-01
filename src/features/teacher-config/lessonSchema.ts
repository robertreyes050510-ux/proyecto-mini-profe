import type {
  CorrectionIntensity,
  GradeLevel,
  LessonConfig,
  LessonFreedomLevel,
  LessonResponseMode,
  ResponseLengthProfile,
  SpanishLevel,
} from '@/types/domain';

const gradeLevels: GradeLevel[] = ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8'];
const spanishLevels: SpanishLevel[] = [
  'newcomer',
  'beginner',
  'developing',
  'intermediate',
];
const responseModes: LessonResponseMode[] = ['strict', 'guided'];
const freedomLevels: LessonFreedomLevel[] = ['low', 'medium', 'high'];
const correctionIntensities: CorrectionIntensity[] = ['low', 'medium', 'high'];
const responseLengths: ResponseLengthProfile[] = ['short', 'medium', 'extended'];

export const lessonConfigDefaults: Omit<LessonConfig, 'id'> = {
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

export function normalizeLessonConfig(
  input: Partial<LessonConfig> | null | undefined,
): LessonConfig {
  const source = input ?? {};

  return {
    id: normalizeString(source.id) || 'lesson-runtime',
    gradeLevel: normalizeEnum(source.gradeLevel, gradeLevels, lessonConfigDefaults.gradeLevel),
    approximateAge: normalizeString(source.approximateAge) || lessonConfigDefaults.approximateAge,
    spanishLevel: normalizeEnum(
      source.spanishLevel,
      spanishLevels,
      lessonConfigDefaults.spanishLevel,
    ),
    topic: normalizeString(source.topic),
    objective: normalizeString(source.objective),
    allowedVocabulary: normalizeStringList(source.allowedVocabulary),
    priorityGrammarStructures: normalizeStringList(source.priorityGrammarStructures),
    culturalContext: normalizeString(source.culturalContext),
    supportPhrases: normalizeStringList(source.supportPhrases),
    responseMode: normalizeEnum(
      source.responseMode,
      responseModes,
      lessonConfigDefaults.responseMode,
    ),
    freedomLevel: normalizeEnum(
      source.freedomLevel,
      freedomLevels,
      lessonConfigDefaults.freedomLevel,
    ),
    correctionIntensity: normalizeEnum(
      source.correctionIntensity,
      correctionIntensities,
      lessonConfigDefaults.correctionIntensity,
    ),
    englishSupportAllowed: normalizeBoolean(
      source.englishSupportAllowed,
      lessonConfigDefaults.englishSupportAllowed,
    ),
    responseLength: normalizeEnum(
      source.responseLength,
      responseLengths,
      lessonConfigDefaults.responseLength,
    ),
    avoidTopics: normalizeStringList(source.avoidTopics),
    teacherSpecialInstructions: normalizeString(source.teacherSpecialInstructions),
    maxResponseSentences: normalizeInteger(source.maxResponseSentences, 1, 4, 2),
    maxQuestionsPerTurn: normalizeInteger(source.maxQuestionsPerTurn, 0, 2, 1),
    englishFallbackText:
      normalizeString(source.englishFallbackText) ||
      lessonConfigDefaults.englishFallbackText,
  };
}

export function validateLessonConfig(
  input: Partial<LessonConfig> | null | undefined,
): string[] {
  const config = normalizeLessonConfig(input);
  const rawFallback = normalizeString(input?.englishFallbackText);
  const issues: string[] = [];

  if (!config.topic) {
    issues.push('Falta el tema de la leccion.');
  }

  if (!config.objective) {
    issues.push('Falta el objetivo comunicativo de la leccion.');
  }

  if (!config.allowedVocabulary.length) {
    issues.push('Debe existir al menos una palabra de vocabulario prioritario.');
  }

  if (!rawFallback) {
    issues.push('Falta el fallback para apoyo en ingles.');
  }

  if (config.maxResponseSentences < 1) {
    issues.push('La configuracion de oraciones maximas es invalida.');
  }

  return issues;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeString(item))
        .filter(Boolean),
    ),
  );
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
) {
  return typeof value === 'string' && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}
