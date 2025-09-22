// src/lib/firebase.ts
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  "projectId": "cosmic-raid-app",
  "appId": "1:412519609799:web:ba8fc21ad0fe1bd20655e2",
  "storageBucket": "cosmic-raid-app.firebasestorage.app",
  "apiKey": "AIzaSyCtfKnp_2QgEi8KJZm_4zG2KsOvtD2nAuI",
  "authDomain": "cosmic-raid-app.firebaseapp.com",
  "messagingSenderId": "412519609799"
};

// Client-side initialization.
function getClientApp() {
  if (getApps().length) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

const app = getClientApp();
const auth = getAuth(app);
const db = getFirestore(app);


export { db, auth, getClientApp };
