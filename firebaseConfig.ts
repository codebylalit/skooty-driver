import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA8sIenzk6VovyK7hlj8Z30U71IMS95P7Q",
  authDomain: "skooty07.firebaseapp.com",
  projectId: "skooty07",
  storageBucket: "skooty07.firebasestorage.app",
  messagingSenderId: "342721275713",
  appId: "1:342721275713:web:c08c1f7704edbb6ca963c0",
  measurementId: "G-HFR06FGVPY"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Use initializeAuth with AsyncStorage for React Native
let auth;
try {
  auth = getAuth(app);
} catch (e) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

export { auth };
export const db = getFirestore(app); 