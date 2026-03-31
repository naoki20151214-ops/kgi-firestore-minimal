import { collection, addDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const roughGoalInput = document.getElementById("roughGoalInput");
const roughReasonInput = document.getElementById("roughReasonInput");
const roughDeadlineInput = document.getElementById("roughDeadlineInput");
const roughCurrentStateInput = document.getElementById("roughCurrentStateInput");
const startDeepDiveButton = document.getElementById("startDeepDiveButton");

const questionSection = document.getElementById("questionSection");
const questionProgress = document.getElementById("questionProgress");
const questionText = document.getElementById("questionText");
const questionAnswerInput = document.getElementById("questionAnswerInput");
const prevQuestionButton = document.getElementById("prevQuestionButton");
const nextQuestionButton = document.getElementById("nextQuestionButton");

const proposalSection = document.getElementById("proposalSection");
const proposalList = document.getElementById("proposalList");
const editSection = document.getElementById("editSection");
const nameInput = document.getElementById("kgiName");
const goalTextInput = document.getElementById("kgiGoalText");
const deadlineInput = document.getElementById("kgiDeadline");
const levelInput = document.getElementById("kgiLevel");
const saveButton = document.getElementById("saveButton");

const step1Label = document.getElementById("step1Label");
const step2Label = document.getElementById("step2Label");
const step3Label = document.getElementById("step3Label");
const step4Label = document.getElementById("step4Label");
const statusText = document.getElementById("statusText");

const buildInitialDetailEntryStorageKey = (kgiId) => `kgi-detail-entry:${kgiId}`;
const DEFAULT_KGI_DURATION_DAYS = 100;

const DEEP_DIVE_QUESTIONS = [
  { id: "targetAudience", text: "どんな人に届けたいですか？（例: 忙しい会社員、子育て中の人）" },
  { id: "channel", text: "主にどこで発信・活動したいですか？（例: X、Instagram、ブログ、YouTube）" },
  { id: "monetizationType", text: "どんな形で収益化したいですか？（例: 商品販売、広告、サブスク、案件）" },
  { id: "availableTime", text: "1週間にどれくらい時間を使えますか？" },
  { id: "faceOrVoiceStyle", text: "顔出し・声出し・文章中心の希望はありますか？" }
];

let db;
const wizardState = {
  step: 1,
  sessionId: null,
  roughInput: null,
  questions: DEEP_DIVE_QUESTIONS.map((question, index) => ({ ...question, order: index + 1 })),
  currentQuestionIndex: 0,
  answers: {},
  proposals: [],
  selectedProposalIndex: -1,
  selectedDraft: null,
  tags: {}
};

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

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const setStep = (step) => {
  wizardState.step = step;
  step1Label.classList.toggle("active", step === 1);
  step2Label.classList.toggle("active", step === 2);
  step3Label.classList.toggle("active", step === 3);
  step4Label.classList.toggle("active", step === 4);
};

const generateRoadmap = async (kgiData) => {
  const response = await fetch("/api/generate-roadmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

const saveAnswerFromField = () => {
  const currentQuestion = wizardState.questions[wizardState.currentQuestionIndex];
  wizardState.answers[currentQuestion.id] = (questionAnswerInput.value || "").trim();
};

const renderQuestion = () => {
  const currentQuestion = wizardState.questions[wizardState.currentQuestionIndex];
  const total = wizardState.questions.length;
  questionProgress.textContent = `質問 ${wizardState.currentQuestionIndex + 1} / ${total}`;
  questionText.textContent = currentQuestion.text;
  questionAnswerInput.value = wizardState.answers[currentQuestion.id] || "";
  prevQuestionButton.disabled = wizardState.currentQuestionIndex === 0;
  nextQuestionButton.textContent = wizardState.currentQuestionIndex === total - 1 ? "KGI案を作成" : "次へ";
};

const parseAvailableTimeTag = (text) => {
  if (!text) return "unknown";
  if (/1.?2.?時間|90分|2時間未満/.test(text)) return "low";
  if (/3.?5.?時間|毎日1時間|平日/.test(text)) return "medium";
  if (/6.?時間|毎日2時間|フルタイム/.test(text)) return "high";
  return "medium";
};

const parseMotivationTag = (reasonText) => {
  if (!reasonText) return "other";
  if (/収入|売上|お金|副業|生活/.test(reasonText)) return "income";
  if (/成長|挑戦|スキル|実績/.test(reasonText)) return "growth";
  if (/貢献|役立つ|喜ん/.test(reasonText)) return "contribution";
  return "other";
};

const extractTags = () => {
  const targetAudience = wizardState.answers.targetAudience || "";
  const channel = wizardState.answers.channel || "";
  const monetizationType = wizardState.answers.monetizationType || "";
  const availableTime = parseAvailableTimeTag(wizardState.answers.availableTime || "");
  const faceOrVoiceStyle = wizardState.answers.faceOrVoiceStyle || "";
  const motivationType = parseMotivationTag(wizardState.roughInput?.reason || "");

  return {
    targetAudience,
    channel,
    monetizationType,
    availableTime,
    faceOrVoiceStyle,
    motivationType
  };
};

const generateProposals = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = wizardState.roughInput.deadline || formatDateInputValue(addDays(today, DEFAULT_KGI_DURATION_DAYS));
  const roughGoal = wizardState.roughInput.roughGoal || "継続できる目標を作る";
  const channel = wizardState.tags.channel || "発信チャネル";
  const audience = wizardState.tags.targetAudience || "届けたい相手";
  const monetization = wizardState.tags.monetizationType || "収益化方法";

  return [
    {
      name: `認知拡大型: ${channel}で土台を作る`,
      goalText: `${deadline}までに「${audience}」向けに${channel}で発信を継続し、${roughGoal}につながる見込み顧客の導線を安定化する。`,
      deadline,
      level: "easy",
      reason: "まずは届ける相手と発信導線を固める案です。初心者でも取り組みやすく、改善の手がかりが得やすいです。",
      concerns: "短期の売上は出にくい可能性があります。"
    },
    {
      name: `収益化優先型: ${monetization}を早く検証`,
      goalText: `${deadline}までに${monetization}を主軸にしたオファーを作り、${channel}経由で初回販売まで到達する。`,
      deadline,
      level: "normal",
      reason: "売上に直結する検証を先に進める案です。限られた時間でも成果判定がしやすい構成です。",
      concerns: "設計が甘いと提案色が強くなり、継続率が下がる恐れがあります。"
    },
    {
      name: "継続重視型: 無理なく積み上げる",
      goalText: `${deadline}までに週次で継続できる運用リズムを作り、${roughGoal}の達成に必要な行動を習慣化する。`,
      deadline,
      level: "detailed",
      reason: "継続のしやすさを最優先にした案です。途中離脱を防ぎ、長期的な成果に繋げやすくなります。",
      concerns: "成果が見えるまで時間がかかることがあります。"
    }
  ];
};

const renderProposals = () => {
  proposalList.innerHTML = "";
  wizardState.proposals.forEach((proposal, index) => {
    const card = document.createElement("article");
    card.className = `proposal-card${wizardState.selectedProposalIndex === index ? " selected" : ""}`;
    card.innerHTML = `
      <h3>${proposal.name}</h3>
      <p class="proposal-meta"><strong>ゴール説明:</strong> ${proposal.goalText}</p>
      <p class="proposal-meta"><strong>期限:</strong> ${proposal.deadline}</p>
      <p class="proposal-meta"><strong>説明レベル:</strong> ${proposal.level}</p>
      <p class="proposal-meta"><strong>おすすめ理由:</strong> ${proposal.reason}</p>
      <p class="proposal-meta"><strong>気になる点:</strong> ${proposal.concerns}</p>
      <button type="button" class="secondary" data-proposal-index="${index}">この案を使う</button>
    `;
    proposalList.appendChild(card);
  });

  proposalList.querySelectorAll("button[data-proposal-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.proposalIndex);
      wizardState.selectedProposalIndex = index;
      wizardState.selectedDraft = { ...wizardState.proposals[index] };
      nameInput.value = wizardState.selectedDraft.name;
      goalTextInput.value = wizardState.selectedDraft.goalText;
      deadlineInput.value = wizardState.selectedDraft.deadline;
      levelInput.value = wizardState.selectedDraft.level;
      editSection.classList.remove("hidden");
      setStep(4);
      renderProposals();
      setStatus("候補を選択しました。必要なら編集して保存してください。", false);
    });
  });
};

const updateCreationSession = async (payload) => {
  if (!db || !wizardState.sessionId) return;
  try {
    await updateDoc(doc(db, "kgiCreationSessions", wizardState.sessionId), {
      ...payload,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to update creation session", error);
  }
};

const ensureCreationSession = async () => {
  if (!db) {
    alert("Firebase接続を初期化中です。数秒後に再試行してください。");
    return false;
  }
  if (wizardState.sessionId) return true;

  const sessionData = {
    flowVersion: "in-app-ai-wizard-v1",
    status: "questioning",
    roughInput: wizardState.roughInput,
    questionPlan: wizardState.questions,
    answers: {},
    proposalCandidates: [],
    selectedProposalIndex: null,
    editedFields: [],
    finalKgiDraft: null,
    tags: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, "kgiCreationSessions"), sessionData);
  wizardState.sessionId = ref.id;
  return true;
};

startDeepDiveButton.addEventListener("click", async () => {
  const roughGoal = (roughGoalInput.value || "").trim();
  const reason = (roughReasonInput.value || "").trim();
  if (!roughGoal || !reason) {
    alert("「やりたいこと」と「なぜやりたいか」は入力してください。");
    return;
  }

  wizardState.roughInput = {
    roughGoal,
    reason,
    deadline: roughDeadlineInput.value || "",
    currentState: (roughCurrentStateInput.value || "").trim()
  };

  const ready = await ensureCreationSession();
  if (!ready) return;

  questionSection.classList.remove("hidden");
  setStep(2);
  renderQuestion();
  setStatus("深掘り質問を開始しました。", false);
});

prevQuestionButton.addEventListener("click", () => {
  saveAnswerFromField();
  if (wizardState.currentQuestionIndex > 0) {
    wizardState.currentQuestionIndex -= 1;
    renderQuestion();
  }
});

nextQuestionButton.addEventListener("click", async () => {
  saveAnswerFromField();
  const currentQuestion = wizardState.questions[wizardState.currentQuestionIndex];
  const currentAnswer = wizardState.answers[currentQuestion.id] || "";
  if (!currentAnswer) {
    alert("この質問に回答してから次へ進んでください。");
    return;
  }

  await updateCreationSession({
    answers: wizardState.answers,
    deepDiveResponses: wizardState.questions.map((question) => ({
      questionId: question.id,
      questionText: question.text,
      order: question.order,
      answer: wizardState.answers[question.id] || "",
      createdAt: new Date().toISOString()
    }))
  });

  const isLast = wizardState.currentQuestionIndex === wizardState.questions.length - 1;
  if (!isLast) {
    wizardState.currentQuestionIndex += 1;
    renderQuestion();
    return;
  }

  wizardState.tags = extractTags();
  wizardState.proposals = generateProposals();
  proposalSection.classList.remove("hidden");
  setStep(3);
  renderProposals();

  await updateCreationSession({
    status: "proposal_ready",
    tags: wizardState.tags,
    proposalCandidates: wizardState.proposals
  });

  setStatus("KGI候補を作成しました。使いたい案を選んでください。", false);
});

saveButton.disabled = true;
setStatus("Firebase接続を初期化しています...");

(async () => {
  try {
    db = await getDb();
    saveButton.disabled = false;
    setStatus("Firebase接続が完了しました。", false);
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

  if (wizardState.selectedProposalIndex < 0) {
    alert("先にKGI候補を1つ選んでください。");
    return;
  }

  const name = (nameInput.value || "").trim();
  const goalText = (goalTextInput.value || "").trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = formatDateInputValue(today);
  const deadline = deadlineInput.value || formatDateInputValue(addDays(today, DEFAULT_KGI_DURATION_DAYS));
  const level = levelInput.value || "normal";

  if (!name) {
    alert("KGI名を入力してください。");
    return;
  }

  saveButton.disabled = true;

  const selectedOriginal = wizardState.proposals[wizardState.selectedProposalIndex];
  const finalDraft = { name, goalText, deadline, level };
  const editedFields = Object.keys(finalDraft).filter((key) => finalDraft[key] !== selectedOriginal[key]);

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
      explanationLevel: level,
      kgiCreationSessionId: wizardState.sessionId,
      kgiCreationData: {
        flowVersion: "in-app-ai-wizard-v1",
        roughInput: wizardState.roughInput,
        deepDiveResponses: wizardState.questions.map((question) => ({
          questionId: question.id,
          questionText: question.text,
          order: question.order,
          answer: wizardState.answers[question.id] || "",
          createdAt: new Date().toISOString()
        })),
        tags: wizardState.tags,
        proposalCandidates: wizardState.proposals,
        selectedProposalIndex: wizardState.selectedProposalIndex,
        editedFields,
        finalKgi: finalDraft
      }
    };

    const kgiDocRef = await addDoc(collection(db, "kgis"), createdKgi);

    await updateCreationSession({
      status: "completed",
      selectedProposalIndex: wizardState.selectedProposalIndex,
      editedFields,
      finalKgiDraft: finalDraft,
      finalKgiId: kgiDocRef.id,
      completedAt: serverTimestamp()
    });

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
