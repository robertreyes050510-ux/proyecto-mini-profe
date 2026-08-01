import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseClientConfig, hasFirebaseClientConfig } from './config';

let firebaseApp: FirebaseApp | null = null;

export function getFirebaseClientApp() {
  if (!hasFirebaseClientConfig()) {
    throw new Error('Firebase client config is missing.');
  }

  if (firebaseApp) {
    return firebaseApp;
  }

  firebaseApp = getApps().length
    ? getApp()
    : initializeApp(firebaseClientConfig);

  return firebaseApp;
}

export function getFirebaseClientAuth() {
  return getAuth(getFirebaseClientApp());
}

export function getFirebaseClientDb() {
  return getFirestore(getFirebaseClientApp());
}
