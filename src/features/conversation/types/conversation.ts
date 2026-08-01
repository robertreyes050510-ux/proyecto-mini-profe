export type ConversationStatus =
  | 'idle'
  | 'wake_detected'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error';

export type ConversationTurnResult = {
  text: string;
  detectedLanguage: 'es' | 'en' | 'mixed' | 'unknown';
  usedFallback: boolean;
  validationFlags: string[];
};

export type ConversationApiRequest = {
  studentTranscript: string;
  activeCharacter: {
    name: string;
    personality: string;
    wakePhrase: string;
    wakeAliases: string[];
  };
  activeLesson: {
    topic: string;
    gradeLevel: string;
    objective: string;
    allowedVocabulary: string[];
    supportPhrases: string[];
    responseMode: 'strict' | 'guided';
    freedomLevel: 'low' | 'medium' | 'high';
    maxResponseSentences: number;
    maxQuestionsPerTurn: number;
    englishFallbackText: string;
  };
};
