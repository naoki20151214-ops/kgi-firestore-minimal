import { collection, addDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const nameInput = document.getElementById("kgiName");
const goalTextInput = document.getElementById("kgiGoalText");
const deadlineInput = document.getElementById("kgiDeadline");
const levelInput = document.getElementById("kgiLevel");
const saveButton = document.getElementById("saveButton");
const statusText = document.getElementById("statusText");
const simpleModeButton = document.getElementById("simpleModeButton");
const aiModeButton = document.getElementById("aiModeButton");
const aiModeSection = document.getElementById("aiModeSection");
const roughGoalInput = document.getElementById("roughGoalInput");
const roughReasonInput = document.getElementById("roughReasonInput");
const roughDeadlineInput = document.getElementById("roughDeadlineInput");
const roughCurrentStateInput = document.getElementById("roughCurrentStateInput");
const generatePromptButton = document.getElementById("generatePromptButton");
const externalPromptOutput = document.getElementById("externalPromptOutput");
const copyPromptButton = document.getElementById("copyPromptButton");
const refinedKgiInput = document.getElementById("refinedKgiInput");
const applyRefinedKgiButton = document.getElementById("applyRefinedKgiButton");
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
let currentMode = "simple";

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

const setMode = (mode) => {
  currentMode = mode === "ai" ? "ai" : "simple";
  const isAiMode = currentMode === "ai";
  aiModeSection?.classList.toggle("hidden", !isAiMode);
  simpleModeButton?.classList.toggle("active", !isAiMode);
  aiModeButton?.classList.toggle("active", isAiMode);
};

const buildExternalAiPrompt = ({ roughGoal, reason, deadline, currentState }) => {
  const targetDeadline = deadline || "未設定";

  return [
    "あなたは事業KGI設計の専門家です。",
    "以下の情報をもとに、実行可能で測定可能なKGIを1つに整えてください。",
    "",
    "【入力情報】",
    `- やりたいこと: ${roughGoal || "未入力"}`,
    `- なぜやりたいか: ${reason || "未入力"}`,
    `- 期限: ${targetDeadline}`,
    `- 今の状況: ${currentState || "未入力"}`,
    "",
    "【要件】",
    "- 抽象表現ではなく、定量・期限付きで表現する",
    "- 達成判断できる成功条件を含める",
    "- 必要なら前提条件や補足を簡潔に示す",
    "",
    "次のJSON形式で回答してください（前後に説明文は不要）。",
    '{"name":"KGI名","goalText":"ゴール説明","deadline":"YYYY-MM-DD","level":"easy|normal|detailed"}'
  ].join("\n");
};

const applyRefinedKgiToForm = (rawText) => {
  if (!rawText.trim()) {
    alert("貼り戻し欄に内容を入力してください。");
    return false;
  }

  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed?.name === "string") {
      nameInput.value = parsed.name.trim();
    }
    if (typeof parsed?.goalText === "string") {
      goalTextInput.value = parsed.goalText.trim();
    }
    if (typeof parsed?.deadline === "string") {
      deadlineInput.value = parsed.deadline.trim();
    }
    if (typeof parsed?.level === "string" && ["easy", "normal", "detailed"].includes(parsed.level)) {
      levelInput.value = parsed.level;
    }
    setStatus("貼り戻したKGIを保存フォームに反映しました。");
    return true;
  } catch (error) {
    alert("貼り戻し欄はJSON形式で入力してください。");
    return false;
  }
};

setMode("simple");

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

simpleModeButton?.addEventListener("click", () => {
  setMode("simple");
});

aiModeButton?.addEventListener("click", () => {
  setMode("ai");
});

generatePromptButton?.addEventListener("click", () => {
  const promptText = buildExternalAiPrompt({
    roughGoal: roughGoalInput?.value.trim() || "",
    reason: roughReasonInput?.value.trim() || "",
    deadline: roughDeadlineInput?.value || "",
    currentState: roughCurrentStateInput?.value.trim() || ""
  });

  externalPromptOutput.value = promptText;
  setStatus("外部AI向けプロンプトを生成しました。");
});

copyPromptButton?.addEventListener("click", async () => {
  const promptText = externalPromptOutput?.value.trim() || "";
  if (!promptText) {
    alert("先にプロンプトを生成してください。");
    return;
  }

  try {
    await navigator.clipboard.writeText(promptText);
    setStatus("プロンプトをコピーしました。");
  } catch (error) {
    alert("コピーに失敗しました。手動でコピーしてください。");
  }
});

applyRefinedKgiButton?.addEventListener("click", () => {
  const applied = applyRefinedKgiToForm(refinedKgiInput?.value || "");
  if (applied) {
    setMode("simple");
  }
});

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
