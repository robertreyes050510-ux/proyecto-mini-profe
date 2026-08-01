import type {
  ConversationApiRequest,
  ConversationTurnResult,
} from '@/features/conversation/types/conversation';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

export async function generateTeacherControlledReply(
  input: ConversationApiRequest,
): Promise<ConversationTurnResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Falta OPENAI_API_KEY en el servidor. Agregala en .env.local para activar las respuestas del peluche.',
    );
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5',
      store: false,
      input: [
        {
          role: 'system',
          content: buildSystemPrompt(input),
        },
        {
          role: 'user',
          content: buildUserPrompt(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI devolvio ${response.status}. ${errorText || 'No se pudo generar la respuesta.'}`,
    );
  }

  const data = (await response.json()) as OpenAiResponsesApiPayload;
  const rawText = extractResponseText(data);
  const sanitizedText = sanitizeReplyText(
    rawText || input.activeLesson.englishFallbackText,
    input.activeLesson.maxResponseSentences,
  );
  const usedFallback =
    normalizeComparableText(sanitizedText) ===
    normalizeComparableText(input.activeLesson.englishFallbackText);

  return {
    text: sanitizedText,
    detectedLanguage: usedFallback
      ? 'en'
      : inferDetectedLanguage(input.studentTranscript, input.activeLesson.allowedVocabulary),
    usedFallback,
    validationFlags: buildValidationFlags(input, usedFallback),
  };
}

type OpenAiResponsesApiPayload = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function buildSystemPrompt(input: ConversationApiRequest) {
  const freedomGuidance = getFreedomGuidance(input.activeLesson.freedomLevel);
  const responseModeGuidance =
    input.activeLesson.responseMode === 'strict'
      ? [
          'Modo estricto: mantente muy cerca del vocabulario permitido y de las frases de apoyo.',
          'No introduzcas temas nuevos, pero si el alumno hace una pregunta social muy simple de aula puedes responder de forma breve y amable antes de volver al tono pedagogico.',
          'Si hace falta corregir, hazlo con una reformulacion muy corta y positiva.',
        ].join(' ')
      : [
          'Modo guiado: puedes usar espanol escolar simple alrededor del tema.',
          freedomGuidance,
          'No conviertas esto en una conversacion libre fuera de la leccion.',
        ].join(' ');
  const styleGuidance = [
    'Tu respuesta debe sonar como una mini maestra amable, no como un diccionario.',
    'Aunque seas breve, intenta que la respuesta tenga una pequena intencion pedagogica: corregir, modelar, animar o invitar a repetir.',
    'Cuando la pregunta sea "como se dice ...", prefiere responder con un patron como: "En espanol decimos ..." seguido de una invitacion corta.',
    'Si el alumno ya dijo algo correcto de la leccion, puedes reforzarlo con entusiasmo breve antes de seguir.',
    'Si el alumno hace una pregunta social corta como "como estas", puedes responder de manera calida y muy breve en espanol.',
  ].join(' ');

  return [
    `Eres ${input.activeCharacter.name}, un personaje educativo para ninos que ensena espanol.`,
    `Tu personalidad es: ${input.activeCharacter.personality}.`,
    `Nivel del alumno: ${input.activeLesson.gradeLevel}.`,
    `Tema de la leccion: ${input.activeLesson.topic}.`,
    `Objetivo pedagogico: ${input.activeLesson.objective}.`,
    'Reglas obligatorias:',
    '- Responde solo en espanol.',
    '- Nunca traduzcas al ingles.',
    `- Maximo ${input.activeLesson.maxResponseSentences} oraciones.`,
    `- Maximo ${input.activeLesson.maxQuestionsPerTurn} pregunta por turno.`,
    '- Mantennte breve, natural y positiva.',
    '- Evita respuestas secas de una sola palabra salvo que no haya otra opcion.',
    '- Si el alumno usa ingles de forma general, responde exactamente con el fallback indicado.',
    '- Si el alumno usa una palabra o frase aislada en ingles relacionada con la leccion, intenta corregirla positivamente en espanol en vez de salirte del tema.',
    '- Si corriges, hazlo con tono amable y motivador.',
    responseModeGuidance,
    styleGuidance,
    `Fallback exacto si corresponde: "${input.activeLesson.englishFallbackText}"`,
    'Devuelve solo el texto final que dira el peluche. No uses listas, notas ni etiquetas.',
  ].join('\n');
}

function buildUserPrompt(input: ConversationApiRequest) {
  const supportPhrases = input.activeLesson.supportPhrases.length
    ? input.activeLesson.supportPhrases.join(', ')
    : 'ninguna';

  return [
    `Frase del estudiante: ${input.studentTranscript}`,
    `Vocabulario permitido: ${input.activeLesson.allowedVocabulary.join(', ') || 'ninguno'}`,
    `Frases de apoyo permitidas: ${supportPhrases}`,
    `Maximo de oraciones: ${input.activeLesson.maxResponseSentences}`,
    `Maximo de preguntas: ${input.activeLesson.maxQuestionsPerTurn}`,
    'Haz que la respuesta se sienta util en clase: un poco mas calida, un poco mas guiada, pero todavia muy corta.',
    'Genera ahora la respuesta final del personaje.',
  ].join('\n');
}

function extractResponseText(payload: OpenAiResponsesApiPayload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        return content.text.trim();
      }
    }
  }

  return '';
}

function sanitizeReplyText(text: string, maxSentences: number) {
  const cleaned = text.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return 'Intentalo otra vez en espanol.';
  }

  const sentenceMatches = cleaned.match(/[^.!?]+[.!?]?/g) ?? [cleaned];
  const limitedText = sentenceMatches
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, Math.max(1, maxSentences))
    .join(' ')
    .trim();

  return limitedText || cleaned;
}

function inferDetectedLanguage(
  studentTranscript: string,
  allowedVocabulary: string[],
): ConversationTurnResult['detectedLanguage'] {
  const normalizedTranscript = normalizeComparableText(studentTranscript);
  const normalizedVocabulary = allowedVocabulary.map(normalizeComparableText);

  if (!normalizedTranscript) {
    return 'unknown';
  }

  const hasEnglishCue = /\b(hello|dog|cat|good morning|good afternoon|good night|what|how|say|please)\b/.test(
    normalizedTranscript,
  );
  const hasSpanishCue =
    /\b(hola|buenos dias|buenas tardes|buenas noches|como|puedes|decir|espanol)\b/.test(
      normalizedTranscript,
    ) || normalizedVocabulary.some((word) => normalizedTranscript.includes(word));

  if (hasEnglishCue && hasSpanishCue) {
    return 'mixed';
  }

  if (hasEnglishCue) {
    return 'en';
  }

  if (hasSpanishCue) {
    return 'es';
  }

  return 'unknown';
}

function buildValidationFlags(
  input: ConversationApiRequest,
  usedFallback: boolean,
) {
  const flags = [
    `response_mode:${input.activeLesson.responseMode}`,
    `freedom_level:${input.activeLesson.freedomLevel}`,
    `max_sentences:${input.activeLesson.maxResponseSentences}`,
  ];

  if (usedFallback) {
    flags.push('used_english_fallback');
  }

  return flags;
}

function getFreedomGuidance(level: ConversationApiRequest['activeLesson']['freedomLevel']) {
  switch (level) {
    case 'high':
      return 'Puedes ampliar un poco con espanol simple de aula, siempre dentro del mismo tema y del objetivo.';
    case 'medium':
      return 'Puedes usar un poco de contexto adicional, pero manten la respuesta bien controlada.';
    case 'low':
    default:
      return 'No te salgas del vocabulario central salvo conectores minimos de espanol escolar.';
  }
}

function normalizeComparableText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
