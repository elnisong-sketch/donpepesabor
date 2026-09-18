import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB8KOPqSs2NokPYTV6_gRwISt5kiIoUI4Q",
  authDomain: "elnisong-413c2.firebaseapp.com",
  projectId: "elnisong-413c2",
  storageBucket: "elnisong-413c2.firebasestorage.app",
  messagingSenderId: "454172662648",
  appId: "1:454172662648:web:e12ad81cf53ec8ed09c68d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
