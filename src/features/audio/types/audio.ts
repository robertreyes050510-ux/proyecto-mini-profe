export interface SpeechRecognizer {
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

export interface SpeechSynthesizer {
  speak: (text: string) => Promise<void>;
  stop: () => void;
}
