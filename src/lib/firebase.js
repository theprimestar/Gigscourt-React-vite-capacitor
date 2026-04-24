import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBvbUwgjSJV7ebtpjZHQeyIH2tXIWnTIaA",
  authDomain: "the-gigscourt-project.firebaseapp.com",
  projectId: "the-gigscourt-project",
  storageBucket: "the-gigscourt-project.firebasestorage.app",
  messagingSenderId: "590983642327",
  appId: "1:590983642327:web:4e32feca3f2640b8158492",
  measurementId: "G-VE1DT81N0T"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export async function ensureFirebaseAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}
