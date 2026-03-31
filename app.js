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
const questionPromptOutput = document.getElementById("questionPromptOutput");
const copyQuestionPromptButton = document.getElementById("copyQuestionPromptButton");
const questionReplyInput = document.getElementById("questionReplyInput");
const proceedToProposalButton = document.getElementById("proceedToProposalButton");
const kgiProposalSection = document.getElementById("kgiProposalSection");
const proposalPromptOutput = document.getElementById("proposalPromptOutput");
const copyProposalPromptButton = document.getElementById("copyProposalPromptButton");
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
let latestRoughInput = null;
let latestQuestionPrompt = "";

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

const buildQuestionPhasePrompt = ({ roughGoal, reason, deadline, currentState }) => {
  const targetDeadline = deadline || "未設定";

  return [
    "あなたはKGI設計の伴走者です。",
    "いきなりKGIを確定せず、まず深掘り質問だけを返してください。",
    "質問は初心者でも答えやすい短文で、3〜5個に絞ってください。",
    "抽象的な自己分析ではなく、意思決定に必要な質問にしてください。",
    "本音、対象、制約、現実性（時間・継続しやすさ）を拾ってください。",
    "",
    "【入力情報】",
    `- やりたいこと: ${roughGoal || "未入力"}`,
    `- なぜやりたいか: ${reason || "未入力"}`,
    `- 期限: ${targetDeadline}`,
    `- 今の状況: ${currentState || "未入力"}`,
    "",
    "【質問の観点（必要なものだけ使う）】",
    "- 誰向けにやるのか",
    "- どの発信媒体が近いのか",
    "- 何で収益化したいのか",
    "- なぜそのテーマを選ぶのか",
    "- どれくらい時間を使えるのか",
    "- 続けやすい形は何か",
    "- 顔出し/声出し/文章中心などの制約",
    "",
    "【出力ルール】",
    "1. 出力は質問のみ。KGI案・結論・JSONは出さない。",
    "2. 3〜5個の番号付き質問にする。",
    "3. 1問は短く、初心者向けのやさしい日本語にする。"
  ].join("\n");
};

const buildProposalPhasePrompt = ({ roughInput, questionText }) => {
  const targetDeadline = roughInput?.deadline || "未設定";

  return [
    "あなたはKGI設計の専門家です。",
    "以下の初期情報と深掘り質問・回答を踏まえて、現実的で腹落ちするKGIを提案してください。",
    "",
    "【最初の入力】",
    `- やりたいこと: ${roughInput?.roughGoal || "未入力"}`,
    `- なぜやりたいか: ${roughInput?.reason || "未入力"}`,
    `- 期限: ${targetDeadline}`,
    `- 今の状況: ${roughInput?.currentState || "未入力"}`,
    "",
    "【深掘り質問と回答】",
    questionText || "未入力",
    "",
    "【返してほしい内容】",
    "1. おすすめKGI案（1つ）",
    "2. そのKGIをすすめる理由",
    "3. 現時点の懸念点",
    "4. 保存用JSON",
    "",
    "【保存用JSONの仕様（厳守）】",
    "- キー名は name, goalText, deadline, level の4つのみ",
    "- level は easy / normal / detailed のいずれか",
    "- deadline は YYYY-MM-DD 形式",
    "- 半角ダブルクォーテーションのみを使う",
    "- コードブロックにしない",
    "",
    "必要に応じて説明文を先に書いたあと、最後に保存用JSONを1つだけ出力してください。"
  ].join("\n");
};

const sanitizeRefinedKgiJsonText = (rawText) => {
  let normalized = String(rawText ?? "").trim();
  normalized = normalized.replace(/^\s*```json\s*/i, "").replace(/^\s*```\s*/i, "").replace(/\s*```\s*$/i, "");
  normalized = normalized.trim();
  normalized = normalized
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "\"")
    .replace(/[「」]/g, "\"");

  const firstBraceIndex = normalized.indexOf("{");
  const lastBraceIndex = normalized.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    normalized = normalized.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  return normalized;
};

const getJsonParseErrorMessageJa = (error, text) => {
  const message = typeof error?.message === "string" ? error.message : "";
  const positionMatch = message.match(/position\s+(\d+)/i);
  if (positionMatch) {
    return `JSONの解析に失敗しました。${positionMatch[1]}文字目付近の構文が不正です。キー名と文字列は半角ダブルクォーテーション \" で囲み、余分な説明文がないか確認してください。`;
  }

  if (!text.startsWith("{") || !text.endsWith("}")) {
    return "JSONの解析に失敗しました。先頭が {、末尾が } の純粋なJSONオブジェクトのみ貼り付けてください。";
  }

  return "JSONの解析に失敗しました。説明文やMarkdownを除去し、キー名と文字列を半角ダブルクォーテーション \" で囲んだ有効なJSONにしてください。";
};

const applyRefinedKgiToForm = (rawText) => {
  if (!rawText.trim()) {
    alert("貼り戻し欄に内容を入力してください。");
    return false;
  }

  try {
    const normalizedText = sanitizeRefinedKgiJsonText(rawText);
    const parsed = JSON.parse(normalizedText);
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
    setStatus("貼り戻したKGIを保存フォームに反映しました。", false);
    return true;
  } catch (error) {
    const normalizedText = sanitizeRefinedKgiJsonText(rawText);
    alert(getJsonParseErrorMessageJa(error, normalizedText));
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
  latestRoughInput = {
    roughGoal: roughGoalInput?.value.trim() || "",
    reason: roughReasonInput?.value.trim() || "",
    deadline: roughDeadlineInput?.value || "",
    currentState: roughCurrentStateInput?.value.trim() || ""
  };

  latestQuestionPrompt = buildQuestionPhasePrompt(latestRoughInput);
  questionPromptOutput.value = latestQuestionPrompt;
  proposalPromptOutput.value = "";
  kgiProposalSection?.classList.add("hidden");
  setStatus("深掘り質問フェーズ用のプロンプトを生成しました。", false);
});

copyQuestionPromptButton?.addEventListener("click", async () => {
  const promptText = questionPromptOutput?.value.trim() || "";
  if (!promptText) {
    alert("先にプロンプトを生成してください。");
    return;
  }

  try {
    await navigator.clipboard.writeText(promptText);
    setStatus("深掘り質問フェーズ用プロンプトをコピーしました。", false);
  } catch (error) {
    alert("コピーに失敗しました。手動でコピーしてください。");
  }
});

proceedToProposalButton?.addEventListener("click", () => {
  if (!latestQuestionPrompt || !latestRoughInput) {
    alert("先に「AIに相談するためのプロンプトを作る」を押してください。");
    return;
  }

  const questionText = questionReplyInput?.value.trim() || "";
  if (!questionText) {
    alert("深掘り質問と回答を貼り付けてから次へ進んでください。");
    return;
  }

  proposalPromptOutput.value = buildProposalPhasePrompt({
    roughInput: latestRoughInput,
    questionText
  });
  kgiProposalSection?.classList.remove("hidden");
  setStatus("KGI提案フェーズ用のプロンプトを生成しました。", false);
});

copyProposalPromptButton?.addEventListener("click", async () => {
  const promptText = proposalPromptOutput?.value.trim() || "";
  if (!promptText) {
    alert("先に「質問回答フェーズへ進む」を押してプロンプトを生成してください。");
    return;
  }

  try {
    await navigator.clipboard.writeText(promptText);
    setStatus("KGI提案フェーズ用プロンプトをコピーしました。", false);
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
