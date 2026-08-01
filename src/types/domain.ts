export type GradeLevel =
  | 'Pre-K'
  | 'K'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8';

export type LessonResponseMode = 'strict' | 'guided';

export type LessonFreedomLevel = 'low' | 'medium' | 'high';

export type SpanishLevel =
  | 'newcomer'
  | 'beginner'
  | 'developing'
  | 'intermediate';

export type CorrectionIntensity = 'low' | 'medium' | 'high';

export type CharacterEnergyLevel = 'calm' | 'balanced' | 'high';

export type CharacterVoiceProfile = 'warm' | 'playful' | 'calm' | 'energetic';

export type ResponseLengthProfile = 'short' | 'medium' | 'extended';

export type CharacterConfig = {
  id: string;
  name: string;
  personality: string;
  voiceId: string;
  voiceProfile: CharacterVoiceProfile;
  energyLevel: CharacterEnergyLevel;
  voiceSpeed: number;
  wakePhrase: string;
  wakeAliases: string[];
};

export type LessonConfig = {
  id: string;
  gradeLevel: GradeLevel;
  approximateAge: string;
  spanishLevel: SpanishLevel;
  topic: string;
  objective: string;
  allowedVocabulary: string[];
  priorityGrammarStructures: string[];
  culturalContext: string;
  supportPhrases: string[];
  responseMode: LessonResponseMode;
  freedomLevel: LessonFreedomLevel;
  correctionIntensity: CorrectionIntensity;
  englishSupportAllowed: boolean;
  responseLength: ResponseLengthProfile;
  avoidTopics: string[];
  teacherSpecialInstructions: string;
  maxResponseSentences: number;
  maxQuestionsPerTurn: number;
  englishFallbackText: string;
};
