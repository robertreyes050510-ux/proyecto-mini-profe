import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseClientDb } from '@/lib/firebase/client';
import type {
  LessonDraft,
  TeacherLessonRecord,
} from '@/features/teacher-config/types/lesson';

const LESSONS_COLLECTION = 'lessons';

function getLessonsCollection() {
  return collection(getFirebaseClientDb(), LESSONS_COLLECTION);
}

export async function listTeacherLessons(ownerId: string) {
  const snapshot = await getDocs(
    query(getLessonsCollection(), where('ownerId', '==', ownerId)),
  );

  return snapshot.docs
    .map(
      (lessonDoc) =>
        ({
          id: lessonDoc.id,
          ...lessonDoc.data(),
        }) as TeacherLessonRecord,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createTeacherLesson(ownerId: string, draft: LessonDraft) {
  const timestamp = new Date().toISOString();

  await addDoc(getLessonsCollection(), {
    ...draft,
    ownerId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function getTeacherLesson(lessonId: string) {
  const snapshot = await getDoc(doc(getFirebaseClientDb(), LESSONS_COLLECTION, lessonId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  } as TeacherLessonRecord;
}

export async function updateTeacherLesson(
  lessonId: string,
  draft: LessonDraft,
) {
  await updateDoc(doc(getFirebaseClientDb(), LESSONS_COLLECTION, lessonId), {
    ...draft,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTeacherLesson(lessonId: string) {
  await deleteDoc(doc(getFirebaseClientDb(), LESSONS_COLLECTION, lessonId));
}
