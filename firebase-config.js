import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "",
  authDomain: "kgi-db.firebaseapp.com",
  projectId: "kgi-db",
  storageBucket: "kgi-db.appspot.com",
  messagingSenderId: "",
  appId: ""
};

let dbInstance;

const isConfigComplete = (config) =>
  typeof config?.apiKey === "string" &&
  config.apiKey.length > 0 &&
  typeof config?.messagingSenderId === "string" &&
  config.messagingSenderId.length > 0 &&
  typeof config?.appId === "string" &&
  config.appId.length > 0;

const loadFirebaseConfig = async () => {
  if (isConfigComplete(firebaseConfig)) {
    return firebaseConfig;
  }

  const response = await fetch("https://kgi-db.web.app/__/firebase/init.json", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Firebase init config fetch failed: ${response.status}`);
  }

  const runtimeConfig = await response.json();

  if (!isConfigComplete(runtimeConfig)) {
    throw new Error("Firebase init config is incomplete.");
  }

  return runtimeConfig;
};

const getDb = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  const config = await loadFirebaseConfig();
  const app = initializeApp(config);
  dbInstance = getFirestore(app);

  return dbInstance;
};

export { getDb };
