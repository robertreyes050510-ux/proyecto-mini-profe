import { NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import type { StudentRuntimeConfig } from '@/features/teacher-config/types/student-runtime';

const STUDENT_RUNTIME_COLLECTION = 'studentRuntime';
const DEFAULT_RUNTIME_DOC = 'default';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const runtime = await readPublishedStudentRuntime();

    if (!runtime) {
      return NextResponse.json({ runtime: null }, { status: 404 });
    }

    return NextResponse.json(
      { runtime },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo leer la configuracion publica del peluche.',
      },
      { status: 500 },
    );
  }
}

async function readPublishedStudentRuntime() {
  const adminDb = getFirebaseAdminDb();

  if (adminDb) {
    const snapshot = await adminDb
      .collection(STUDENT_RUNTIME_COLLECTION)
      .doc(DEFAULT_RUNTIME_DOC)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() as StudentRuntimeConfig;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error('Falta NEXT_PUBLIC_FIREBASE_PROJECT_ID para leer studentRuntime.');
  }

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${STUDENT_RUNTIME_COLLECTION}/${DEFAULT_RUNTIME_DOC}`,
    {
      cache: 'no-store',
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Firestore publico devolvio ${response.status}. ${errorText || 'No se pudo leer studentRuntime.'}`,
    );
  }

  const payload = (await response.json()) as FirestoreDocumentPayload;
  return decodeFirestoreDocument(payload) as StudentRuntimeConfig;
}

type FirestoreDocumentPayload = {
  fields?: Record<string, FirestoreValue>;
};

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  mapValue?: {
    fields?: Record<string, FirestoreValue>;
  };
  arrayValue?: {
    values?: FirestoreValue[];
  };
};

function decodeFirestoreDocument(document: FirestoreDocumentPayload) {
  return decodeMap(document.fields ?? {});
}

function decodeMap(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  );
}

function decodeValue(value: FirestoreValue): unknown {
  if ('stringValue' in value && value.stringValue !== undefined) {
    return value.stringValue;
  }

  if ('integerValue' in value && value.integerValue !== undefined) {
    return Number(value.integerValue);
  }

  if ('doubleValue' in value && value.doubleValue !== undefined) {
    return value.doubleValue;
  }

  if ('booleanValue' in value && value.booleanValue !== undefined) {
    return value.booleanValue;
  }

  if ('nullValue' in value) {
    return null;
  }

  if (value.arrayValue) {
    return (value.arrayValue.values ?? []).map(decodeValue);
  }

  if (value.mapValue) {
    return decodeMap(value.mapValue.fields ?? {});
  }

  return null;
}
