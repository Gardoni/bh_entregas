// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCLaqaOCJnkfG4LID1Y5RoFpgEsX9nYGOM",
    authDomain: "testeapi-1ad07.firebaseapp.com",
    databaseURL: "https://testeapi-1ad07-default-rtdb.firebaseio.com",
    projectId: "testeapi-1ad07",
    storageBucket: "testeapi-1ad07.firebasestorage.app",
    messagingSenderId: "323295128076",
    appId: "1:323295128076:web:a08df7c70fe19f01f19c29"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços que você vai usar no app.js
export const auth = getAuth(app);
export const db = getFirestore(app);
// Se for usar o Realtime Database em vez do Firestore, use: 
// import { getDatabase } from "firebase/database"; e export const db = getDatabase(app);