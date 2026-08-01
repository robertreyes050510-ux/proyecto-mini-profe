import {
  inMemoryPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirebaseClientAuth } from './client';

export async function prepareTeacherAuthSession() {
  const auth = getFirebaseClientAuth();
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch {
      await setPersistence(auth, inMemoryPersistence);
    }
  }
  return auth;
}

export async function signInTeacher(email: string, password: string) {
  const auth = await prepareTeacherAuthSession();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerTeacher(email: string, password: string) {
  const auth = await prepareTeacherAuthSession();
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutTeacher() {
  const auth = await prepareTeacherAuthSession();
  return signOut(auth);
}

export function subscribeToTeacherAuth(
  callback: (user: User | null) => void,
) {
  const auth = getFirebaseClientAuth();
  return onAuthStateChanged(auth, callback);
}
