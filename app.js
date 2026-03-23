import { collection, addDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const nameInput = document.getElementById("kgiName");
const goalTextInput = document.getElementById("kgiGoalText");
const deadlineInput = document.getElementById("kgiDeadline");
const levelInput = document.getElementById("kgiLevel");
const saveButton = document.getElementById("saveButton");
const statusText = document.getElementById("statusText");
const buildInitialDetailEntryStorageKey = (kgiId) => `kgi-detail-entry:${kgiId}`;

const DEFAULT_KGI_DURATION_DAYS = 100;

const formatDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

let db;

const generateRoadmap = async (kgiData) => {
  const response = await fetch("/api/generate-roadmap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: kgiData.name ?? "",
      goalText: kgiData.goalText ?? "",
      deadline: kgiData.deadline ?? "",
      level: kgiData.level ?? "normal"
    })
  });

  const responseText = await response.text();
  const data = responseText ? JSON.parse(responseText) : null;

  if (!response.ok || !Array.isArray(data?.roadmapPhases)) {
    throw new Error(data?.error || "ロードマップの生成に失敗しました");
  }

  return {
    roadmapPhases: data.roadmapPhases,
    kgiDescription: typeof data?.kgiDescription === "string" ? data.kgiDescription.trim() : ""
  };
};


const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

saveButton.disabled = true;
setStatus("Firebase接続を初期化しています...");

(async () => {
  try {
    db = await getDb();
    saveButton.disabled = false;
    setStatus("Firebase接続が完了しました。保存できます。");
  } catch (error) {
    console.error(error);
    setStatus("Firebase接続に失敗しました。設定を確認してください。", true);
  }
})();

saveButton.addEventListener("click", async () => {
  if (!db) {
    alert("Firebase接続を初期化中です。数秒後に再試行してください。");
    return;
  }

  const name = nameInput.value.trim();
  const goalText = goalTextInput.value.trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = formatDateInputValue(today);
  const deadline = deadlineInput.value || formatDateInputValue(addDays(today, DEFAULT_KGI_DURATION_DAYS));
  const level = levelInput?.value || "normal";

  if (!name) {
    alert("KGI名を入力してください。");
    return;
  }

  saveButton.disabled = true;

  try {
    const createdKgi = {
      name,
      goalText,
      deadline,
      startDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: "active",
      overallProgress: 0,
      nextActionText: "",
      nextActionReason: "",
      roadmapPhases: [],
      explanationLevel: level
    };

    const kgiDocRef = await addDoc(collection(db, "kgis"), createdKgi);

    try {
      const generated = await generateRoadmap({ name, goalText, deadline, level });

      if (Array.isArray(generated.roadmapPhases) && generated.roadmapPhases.length > 0) {
        await updateDoc(doc(db, "kgis", kgiDocRef.id), {
          roadmapPhases: generated.roadmapPhases,
          goalText: generated.kgiDescription || goalText,
          explanationLevel: level,
          updatedAt: serverTimestamp()
        });
      }
    } catch (roadmapError) {
      console.error("Failed to generate roadmap", roadmapError);
    }

    window.sessionStorage.setItem(buildInitialDetailEntryStorageKey(kgiDocRef.id), JSON.stringify({
      source: "new-kgi",
      createdAt: Date.now(),
      roadmapKpiStarted: false
    }));
    location.href = `./detail.html?id=${kgiDocRef.id}`;
  } catch (error) {
    console.error(error);
    alert("保存に失敗しました。Firebase設定とルールを確認してください。");
    setStatus("保存に失敗しました。Firebase設定とルールを確認してください。", true);
    saveButton.disabled = false;
  }
});
