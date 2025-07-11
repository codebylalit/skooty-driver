import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, getReactNativePersistence, initializeAuth, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyA8sIenzk6VovyK7hlj8Z30U71IMS95P7Q",
  authDomain: "skooty07.firebaseapp.com",
  projectId: "skooty07",
  storageBucket: "skooty07.firebasestorage.app",
  messagingSenderId: "342721275713",
  appId: "1:342721275713:web:c08c1f7704edbb6ca963c0",
  measurementId: "G-HFR06FGVPY"
};
export { firebaseConfig };

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

let _auth = null;
export function getFirebaseAuth() {
  console.debug('[Auth] getFirebaseAuth called');
  if (!_auth) {
    if (Platform.OS === 'web') {
      console.debug('[Auth] Platform is web, initializing with browserLocalPersistence');
      _auth = getAuth(app);
      setPersistence(_auth, browserLocalPersistence).then(() => {
        console.debug('[Auth] browserLocalPersistence set');
      }).catch((e) => {
        console.error('[Auth] Error setting browserLocalPersistence', e);
      });
    } else {
      // React Native/Expo: always use initializeAuth with AsyncStorage persistence
      console.debug('[Auth] Platform is native, initializing with getReactNativePersistence');
      _auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage)
      });
    }
  } else {
    console.debug('[Auth] Returning existing auth instance');
  }
  return _auth;
}

export const db = getFirestore(app);
export const storage = getStorage(app); 