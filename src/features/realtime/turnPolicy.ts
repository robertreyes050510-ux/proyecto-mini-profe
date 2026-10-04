export function isMeaningfulUserSpeech(transcript: string) {
  const normalizedTranscript = normalizeSpeechText(transcript);

  if (!normalizedTranscript) {
    return false;
  }

  // Transcription can label room sounds without any child speech.
  if (['inaudible', 'ruido', 'noise', 'silencio'].includes(normalizedTranscript)) {
    return false;
  }

  return normalizedTranscript.split(' ').some((word) => word.length >= 2);
}

export function isDirectedAtCharacter(input: {
  transcript: string;
  characterName: string;
  wakeAliases: string[];
}) {
  const transcript = normalizeSpeechText(input.transcript);
  const names = [input.characterName, ...input.wakeAliases]
    .map(normalizeSpeechText)
    .filter(Boolean);

  return names.some((name) => new RegExp(`(^| )${escapeRegExp(name)}($| )`).test(transcript));
}

export function normalizeSpeechText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[!?.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
