import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseClientDb } from '@/lib/firebase/client';
import type { TeacherCharacterRecord } from '@/features/teacher-config/types/character';
import type { TeacherLessonRecord } from '@/features/teacher-config/types/lesson';
import type { StudentRuntimeConfig } from '@/features/teacher-config/types/student-runtime';

const STUDENT_RUNTIME_COLLECTION = 'studentRuntime';
const DEFAULT_RUNTIME_DOC = 'default';

function getStudentRuntimeDoc() {
  return doc(getFirebaseClientDb(), STUDENT_RUNTIME_COLLECTION, DEFAULT_RUNTIME_DOC);
}

export async function publishStudentRuntimeConfig(input: {
  activeCharacter: TeacherCharacterRecord;
  activeLesson: TeacherLessonRecord;
  ownerId: string;
}) {
  await setDoc(getStudentRuntimeDoc(), {
    ...input,
    publishedAt: new Date().toISOString(),
  });
}

export async function getPublishedStudentRuntimeConfig() {
  try {
    const response = await fetch('/api/student-runtime', {
      cache: 'no-store',
    });

    if (response.status === 404) {
      return null;
    }

    if (response.ok) {
      const payload = (await response.json()) as {
        runtime?: StudentRuntimeConfig | null;
      };

      return payload.runtime ?? null;
    }
  } catch {
    // Fallback local del cliente para no romper el modo actual si la ruta falla.
  }

  const snapshot = await getDoc(getStudentRuntimeDoc());

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as StudentRuntimeConfig;
}
