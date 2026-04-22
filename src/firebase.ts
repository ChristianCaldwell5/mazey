import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Auth Helpers
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export const logout = () => signOut(auth);

export const getCurrentUserIdToken = async (forceRefresh = false) => {
  if (!auth.currentUser) {
    throw new Error('No authenticated user is available for API authentication.');
  }

  return auth.currentUser.getIdToken(forceRefresh);
};

export { onAuthStateChanged };
export type { User };
