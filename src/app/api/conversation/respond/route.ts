import { NextResponse } from 'next/server';
import type { ConversationApiRequest } from '@/features/conversation/types/conversation';
import { generateTeacherControlledReply } from '@/lib/openai/client';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ConversationApiRequest>;
    const validationError = validateRequest(body);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const result = await generateTeacherControlledReply(body as ConversationApiRequest);

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo generar la respuesta del peluche.',
      },
      { status: 500 },
    );
  }
}

function validateRequest(body: Partial<ConversationApiRequest>) {
  if (!body.studentTranscript?.trim()) {
    return 'Falta la transcripcion del estudiante.';
  }

  if (!body.activeCharacter?.name?.trim()) {
    return 'Falta el personaje activo.';
  }

  if (!body.activeLesson?.topic?.trim()) {
    return 'Falta la leccion activa.';
  }

  return null;
}
