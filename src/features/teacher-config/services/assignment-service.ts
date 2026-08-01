import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseClientDb } from '@/lib/firebase/client';
import type { TeacherAssignmentRecord } from '@/features/teacher-config/types/assignment';
import { getTeacherCharacter } from '@/features/teacher-config/services/character-service';
import { getTeacherLesson } from '@/features/teacher-config/services/lesson-service';
import { publishStudentRuntimeConfig } from '@/features/teacher-config/services/student-runtime-service';

const TEACHER_SETTINGS_COLLECTION = 'teacherSettings';

function getTeacherSettingsDoc(ownerId: string) {
  return doc(getFirebaseClientDb(), TEACHER_SETTINGS_COLLECTION, ownerId);
}

export async function getTeacherAssignment(ownerId: string) {
  const snapshot = await getDoc(getTeacherSettingsDoc(ownerId));

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as TeacherAssignmentRecord;
}

export async function saveTeacherAssignment(
  ownerId: string,
  assignment: Pick<TeacherAssignmentRecord, 'activeCharacterId' | 'activeLessonId'>,
) {
  await setDoc(
    getTeacherSettingsDoc(ownerId),
    {
      ownerId,
      ...assignment,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  const [activeCharacter, activeLesson] = await Promise.all([
    getTeacherCharacter(assignment.activeCharacterId),
    getTeacherLesson(assignment.activeLessonId),
  ]);

  if (!activeCharacter || !activeLesson) {
    throw new Error(
      'No se pudo publicar la configuracion del peluche porque falta el personaje o la leccion activos.',
    );
  }

  await publishStudentRuntimeConfig({
    activeCharacter,
    activeLesson,
    ownerId,
  });
}
