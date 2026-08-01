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
  CharacterDraft,
  TeacherCharacterRecord,
} from '@/features/teacher-config/types/character';

const CHARACTERS_COLLECTION = 'characters';

function getCharactersCollection() {
  return collection(getFirebaseClientDb(), CHARACTERS_COLLECTION);
}

export async function listTeacherCharacters(ownerId: string) {
  const snapshot = await getDocs(
    query(getCharactersCollection(), where('ownerId', '==', ownerId)),
  );

  return snapshot.docs
    .map(
      (characterDoc) =>
        ({
          id: characterDoc.id,
          ...characterDoc.data(),
        }) as TeacherCharacterRecord,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createTeacherCharacter(
  ownerId: string,
  draft: CharacterDraft,
) {
  const timestamp = new Date().toISOString();

  await addDoc(getCharactersCollection(), {
    ...draft,
    ownerId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function getTeacherCharacter(characterId: string) {
  const snapshot = await getDoc(
    doc(getFirebaseClientDb(), CHARACTERS_COLLECTION, characterId),
  );

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  } as TeacherCharacterRecord;
}

export async function updateTeacherCharacter(
  characterId: string,
  draft: CharacterDraft,
) {
  await updateDoc(doc(getFirebaseClientDb(), CHARACTERS_COLLECTION, characterId), {
    ...draft,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTeacherCharacter(characterId: string) {
  await deleteDoc(doc(getFirebaseClientDb(), CHARACTERS_COLLECTION, characterId));
}
