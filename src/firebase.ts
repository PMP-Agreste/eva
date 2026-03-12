import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBDidrDBQC5dvRJGGKMtNffrV867dNgDK8",
  authDomain: "patrulha-maria-da-penha.firebaseapp.com",
  projectId: "patrulha-maria-da-penha",
  storageBucket: "patrulha-maria-da-penha.firebasestorage.app",
  messagingSenderId: "698468798170",
  appId: "1:698468798170:web:fc881c819ead0e34c11fe3"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
