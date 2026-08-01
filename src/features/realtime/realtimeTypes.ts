import type {
  CharacterConfig,
  CharacterEnergyLevel,
  CharacterVoiceProfile,
  CorrectionIntensity,
  GradeLevel,
  LessonFreedomLevel,
  LessonResponseMode,
  ResponseLengthProfile,
  SpanishLevel,
} from '@/types/domain';

export type RealtimeStudentState =
  | 'idle'
  | 'requesting_permission'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'model_processing'
  | 'model_speaking'
  | 'reconnecting'
  | 'error'
  | 'ended';

export type RealtimeTurnDetectionConfig = {
  type: 'server_vad';
  threshold: number;
  silenceDurationMs: number;
  prefixPaddingMs: number;
  createResponse: boolean;
  interruptResponse: boolean;
};

export type RealtimeCharacterSessionConfig = Pick<
  CharacterConfig,
  'name' | 'personality' | 'voiceId' | 'voiceSpeed' | 'wakePhrase' | 'wakeAliases'
> & {
  voiceProfile: CharacterVoiceProfile;
  energyLevel: CharacterEnergyLevel;
};

export type RealtimeLessonSessionConfig = {
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
  englishFallbackText: string;
};

export type BuildSessionInstructionsInput = {
  character: Partial<RealtimeCharacterSessionConfig> | null | undefined;
  lesson: Partial<RealtimeLessonSessionConfig> | null | undefined;
};

export type BuiltSessionInstructions = {
  text: string;
  sections: {
    identity: string[];
    language: string[];
    personality: string[];
    schoolContext: string[];
    studentLevel: string[];
    curriculum: string[];
    conversationalBehavior: string[];
    correctionStrategy: string[];
    boundaries: string[];
    voiceInteraction: string[];
  };
  normalized: {
    character: RealtimeCharacterSessionConfig;
    lesson: RealtimeLessonSessionConfig;
  };
};
