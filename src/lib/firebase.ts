/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  projectId: "peppy-flight-rqk4z",
  appId: "1:851037964591:web:342d704d0fdc61174a39da",
  apiKey: "AIzaSyD-Tsc2vExrL4PMbh2i6jwYvEY6HMtxMtc",
  authDomain: "peppy-flight-rqk4z.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-40794e45-6b0a-453c-8ceb-dc91fee06c6e",
  storageBucket: "peppy-flight-rqk4z.firebasestorage.app",
  messagingSenderId: "851037964591",
  measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the specific custom database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Auth
export const auth = getAuth(app);
