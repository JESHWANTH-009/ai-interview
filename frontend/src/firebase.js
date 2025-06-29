// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey:import.meta.env.VITE_my_apiKey,
  authDomain:import.meta.env.VITE_my_authDomain,
  projectId:import.meta.env.VITE_my_projectId,
  storageBucket:import.meta.env.VITE_my_storageBucket,
  messagingSenderId:import.meta.env.VITE_my_messagingSenderId,
  appId:import.meta.env.my_appId,
  measurementId:import.meta.env.VITE_my_measurementId
};

const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();