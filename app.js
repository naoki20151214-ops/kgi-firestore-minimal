import { collection, addDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const roughGoalInput = document.getElementById("roughGoalInput");
const roughReasonInput = document.getElementById("roughReasonInput");
const roughDeadlineInput = document.getElementById("roughDeadlineInput");
const roughCurrentStateInput = document.getElementById("roughCurrentStateInput");
const startDeepDiveButton = document.getElementById("startDeepDiveButton");

const feasibilitySection = document.getElementById("feasibilitySection");
const normalizedSummary = document.getElementById("normalizedSummary");
const feasibilityLevelText = document.getElementById("feasibilityLevelText");
const feasibilityReasons = document.getElementById("feasibilityReasons");
const feasibilityAltRoute = document.getElementById("feasibilityAltRoute");
const toQuestionsButton = document.getElementById("toQuestionsButton");

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

const FEASIBILITY_LEVEL = {
  REALISTIC: "現実的",
  STRETCH: "背伸びすれば狙える",
  HARD: "今の条件だとかなり厳しい"
};

let db;
const wizardState = {
  step: 1,
  sessionId: null,
  roughInput: null,
  normalizedIntent: null,
  inferredGoal: "",
  uncertaintyFields: [],
  feasibility: null,
  questions: [],
  currentQuestionIndex: 0,
  answers: {},
  askedQuestions: [],
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

const normalizeText = (text) => {
  if (!text) return "";
  return text
    .replace(/[\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/エックス/gi, "X")
    .replace(/ゆーちゅーぶ|ユーチューブ/gi, "YouTube")
    .replace(/いんすた|インスタグラム/gi, "Instagram")
    .replace(/てぃっくとっく|ティックトック/gi, "TikTok")
    .replace(/えーあい|ＡＩ/gi, "AI")
    .replace(/([。！!？?])\1+/g, "$1")
    .trim();
};

const summarizeGoal = (goalText) => {
  if (!goalText) return "目標の方向性をもう少し具体化する";
  if (goalText.length <= 40) return goalText;
  return `${goalText.slice(0, 40)}…`;
};

const daysUntilDeadline = (deadline) => {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const assessFeasibility = (normalized) => {
  const reasons = [];
  const constraints = [];
  let score = 0;

  const deadlineDays = daysUntilDeadline(normalized.deadline);
  if (typeof deadlineDays === "number") {
    if (deadlineDays <= 30) {
      score += 2;
      reasons.push("期限に対してやることが多く、準備期間がかなり短いです。");
      constraints.push("期限");
    } else if (deadlineDays <= 90) {
      score += 1;
      reasons.push("期限が近めなので、優先順位を絞る必要があります。");
      constraints.push("期限");
    }
  }

  if (!normalized.currentState) {
    score += 1;
    reasons.push("今の経験・実績が読み取りにくいため、安全側の設計が必要です。");
    constraints.push("経験・能力");
  } else if (/未経験|初心者|これから|実績なし/.test(normalized.currentState)) {
    score += 1;
    reasons.push("今の経験だと、いきなり大きな形にするより段階化したほうが進めやすいです。");
    constraints.push("経験・能力");
  }

  if (!/週|時間|平日|土日|毎日/.test(normalized.currentState)) {
    score += 1;
    reasons.push("使える時間の情報が少ないため、実行ペースの見積もりが難しいです。");
    constraints.push("使える時間");
  }

  if (!/人|向け|対象|誰/.test(normalized.goal)) {
    score += 1;
    reasons.push("誰向けに届けるかが曖昧で、行動の優先順位が決めにくい状態です。");
    constraints.push("目標の粒度");
  }

  let level = FEASIBILITY_LEVEL.REALISTIC;
  if (score >= 4) {
    level = FEASIBILITY_LEVEL.HARD;
  } else if (score >= 2) {
    level = FEASIBILITY_LEVEL.STRETCH;
  }

  const recommendedScopeChange = level === FEASIBILITY_LEVEL.HARD
    ? "最終成果をそのまま追うより、まずは3か月以内に検証完了できる一段手前の目標へ分解するのがおすすめです。"
    : level === FEASIBILITY_LEVEL.STRETCH
      ? "方向性は良いので、対象・手段・週あたり時間を先に固定すると達成確率が上がります。"
      : "今の条件でも進めやすいので、実行単位（週次アクション）に落とし込んで継続しましょう。";

  return {
    feasibilityLevel: level,
    feasibilityReasons: reasons.length > 0 ? reasons : ["現時点の情報では、期限と条件のバランスはおおむね取れています。"],
    mainConstraints: [...new Set(constraints)],
    recommendedScopeChange
  };
};

const buildDynamicQuestions = (analysis) => {
  const candidates = [];
  if (analysis.uncertaintyFields.includes("targetAudience")) {
    candidates.push({ id: "targetAudience", text: "まず、誰向けの目標にしたいですか？（例: 忙しい会社員、学生など）" });
  }
  if (analysis.uncertaintyFields.includes("monetizationType")) {
    candidates.push({ id: "monetizationType", text: "成果は何で作りますか？（例: 商品販売、広告、案件、サブスク）" });
  }
  if (analysis.uncertaintyFields.includes("availableTime")) {
    candidates.push({ id: "availableTime", text: "1週間で使える時間はどれくらいですか？（例: 週5時間）" });
  }
  if (analysis.uncertaintyFields.includes("channel")) {
    candidates.push({ id: "channel", text: "主にどのチャネルで進めますか？（例: X、Instagram、YouTube）" });
  }
  if (analysis.feasibility.mainConstraints.includes("期限")) {
    candidates.push({ id: "priorityScope", text: "期限内で最優先したい成果は何ですか？（1つだけ）" });
  }
  if (candidates.length < 2) {
    candidates.push({ id: "availableTime", text: "実行ペースを決めるため、1週間で使える時間を教えてください。" });
    candidates.push({ id: "targetAudience", text: "誰に価値を届ける目標か、ひとことで教えてください。" });
  }

  return candidates.slice(0, 3).map((question, index) => ({ ...question, order: index + 1 }));
};

const analyzeRoughInput = (rawInput) => {
  const normalized = {
    goal: normalizeText(rawInput.roughGoal),
    reason: normalizeText(rawInput.reason),
    deadline: rawInput.deadline || "",
    currentState: normalizeText(rawInput.currentState)
  };

  const uncertaintyFields = [];
  if (!/向け|対象|誰/.test(normalized.goal)) uncertaintyFields.push("targetAudience");
  if (!/売上|収益|販売|案件|広告|サブスク|単価/.test(normalized.goal)) uncertaintyFields.push("monetizationType");
  if (!/X|Instagram|YouTube|TikTok|ブログ|メルマガ/.test(normalized.goal + normalized.currentState)) uncertaintyFields.push("channel");
  if (!/週|時間|平日|土日|毎日/.test(normalized.currentState)) uncertaintyFields.push("availableTime");

  const inferredGoal = summarizeGoal(normalized.goal);
  const feasibility = assessFeasibility(normalized);

  return {
    normalizedIntent: normalized,
    inferredGoal,
    uncertaintyFields,
    feasibility
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
  if (/1.?2.?時間|90分|2時間未満|週[1-4]時間/.test(text)) return "low";
  if (/3.?5.?時間|毎日1時間|平日|週[5-9]時間/.test(text)) return "medium";
  if (/6.?時間|毎日2時間|フルタイム|週10時間|週1[0-9]時間/.test(text)) return "high";
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
  const availableTime = parseAvailableTimeTag(wizardState.answers.availableTime || wizardState.normalizedIntent?.currentState || "");
  const motivationType = parseMotivationTag(wizardState.roughInput?.reason || "");

  return {
    targetAudience,
    channel,
    monetizationType,
    availableTime,
    motivationType
  };
};

const generateProposals = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = wizardState.roughInput.deadline || formatDateInputValue(addDays(today, DEFAULT_KGI_DURATION_DAYS));
  const inferredGoal = wizardState.inferredGoal || "継続できる目標を作る";
  const channel = wizardState.tags.channel || "発信チャネル";
  const audience = wizardState.tags.targetAudience || "届けたい相手";
  const monetization = wizardState.tags.monetizationType || "成果化の手段";
  const feasibilityLevel = wizardState.feasibility?.feasibilityLevel || FEASIBILITY_LEVEL.STRETCH;

  const scopePrefix = feasibilityLevel === FEASIBILITY_LEVEL.HARD ? "まずは検証完了を重視し、" : "";

  return [
    {
      name: `検証優先型: 小さく当てる`,
      goalText: `${deadline}までに${audience}向けに${channel}で検証を回し、${scopePrefix}${monetization}につながる初回成果を1件作る。`,
      deadline,
      level: "easy",
      reason: "最小の成果を先に作って実現可能性を上げる案です。厳しめの条件でも前進実感を得やすいです。",
      concerns: "大きな売上目標は次段階に回す必要があります。"
    },
    {
      name: `成果直結型: 期限内で収益導線を作る`,
      goalText: `${deadline}までに「${inferredGoal}」を実現するため、${channel}で見込み顧客導線を整え、${monetization}のオファーを実装する。`,
      deadline,
      level: "normal",
      reason: "成果に近い行動を優先しつつ、期限内で必要な要素をバランスよく進める案です。",
      concerns: "運用時間が少ないと実行密度が不足しやすいです。"
    },
    {
      name: `継続安定型: 習慣化を先に作る`,
      goalText: `${deadline}までに週次で継続できる運用リズムを確立し、${inferredGoal}達成に必要な行動を再現可能な形で定着させる。`,
      deadline,
      level: "detailed",
      reason: "忙しい状況でも継続しやすく、途中離脱を防ぎながら長期成果につなげる案です。",
      concerns: "短期の数値成果が見えるまで時間がかかることがあります。"
    }
  ];
};

const renderFeasibilityBlock = () => {
  const normalized = wizardState.normalizedIntent;
  const feasibility = wizardState.feasibility;
  if (!normalized || !feasibility) return;

  normalizedSummary.innerHTML = `
    <li><strong>やりたいこと:</strong> ${normalized.goal || "（未入力）"}</li>
    <li><strong>背景:</strong> ${normalized.reason || "（未入力）"}</li>
    <li><strong>期限:</strong> ${normalized.deadline || "未設定"}</li>
  `;

  feasibilityLevelText.textContent = feasibility.feasibilityLevel;
  feasibilityReasons.innerHTML = feasibility.feasibilityReasons.map((reason) => `<li>${reason}</li>`).join("");

  if (feasibility.feasibilityLevel === FEASIBILITY_LEVEL.HARD || feasibility.recommendedScopeChange) {
    feasibilityAltRoute.classList.remove("hidden");
    feasibilityAltRoute.textContent = feasibility.recommendedScopeChange;
  } else {
    feasibilityAltRoute.classList.add("hidden");
    feasibilityAltRoute.textContent = "";
  }
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
    flowVersion: "in-app-ai-wizard-v2-feasibility",
    status: "rough_input_received",
    rawInput: wizardState.roughInput,
    normalizedIntent: wizardState.normalizedIntent,
    inferredGoal: wizardState.inferredGoal,
    uncertaintyFields: wizardState.uncertaintyFields,
    feasibilityLevel: wizardState.feasibility?.feasibilityLevel || "",
    feasibilityReasons: wizardState.feasibility?.feasibilityReasons || [],
    mainConstraints: wizardState.feasibility?.mainConstraints || [],
    recommendedScopeChange: wizardState.feasibility?.recommendedScopeChange || "",
    askedQuestions: wizardState.questions,
    userAnswers: {},
    generatedCandidates: [],
    selectedCandidateIndex: null,
    editedFields: [],
    finalKgi: null,
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

  const analysis = analyzeRoughInput(wizardState.roughInput);
  wizardState.normalizedIntent = analysis.normalizedIntent;
  wizardState.inferredGoal = analysis.inferredGoal;
  wizardState.uncertaintyFields = analysis.uncertaintyFields;
  wizardState.feasibility = analysis.feasibility;
  wizardState.questions = buildDynamicQuestions(analysis);
  wizardState.askedQuestions = wizardState.questions;
  wizardState.currentQuestionIndex = 0;
  wizardState.answers = {};

  const ready = await ensureCreationSession();
  if (!ready) return;

  renderFeasibilityBlock();
  feasibilitySection.classList.remove("hidden");
  questionSection.classList.add("hidden");
  proposalSection.classList.add("hidden");
  setStep(2);
  setStatus("入力内容を整理し、実現可能性チェックを作成しました。", false);
});

toQuestionsButton.addEventListener("click", async () => {
  questionSection.classList.remove("hidden");
  renderQuestion();
  await updateCreationSession({
    status: "questioning",
    askedQuestions: wizardState.questions
  });
  setStep(2);
  setStatus("不足している点だけ質問します。", false);
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
    userAnswers: wizardState.answers,
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
    generatedCandidates: wizardState.proposals
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
        flowVersion: "in-app-ai-wizard-v2-feasibility",
        rawInput: wizardState.roughInput,
        normalizedIntent: wizardState.normalizedIntent,
        inferredGoal: wizardState.inferredGoal,
        uncertaintyFields: wizardState.uncertaintyFields,
        feasibilityLevel: wizardState.feasibility?.feasibilityLevel || "",
        feasibilityReasons: wizardState.feasibility?.feasibilityReasons || [],
        mainConstraints: wizardState.feasibility?.mainConstraints || [],
        recommendedScopeChange: wizardState.feasibility?.recommendedScopeChange || "",
        askedQuestions: wizardState.questions,
        userAnswers: wizardState.answers,
        tags: wizardState.tags,
        generatedCandidates: wizardState.proposals,
        selectedCandidateIndex: wizardState.selectedProposalIndex,
        editedFields,
        finalKgi: finalDraft
      }
    };

    const kgiDocRef = await addDoc(collection(db, "kgis"), createdKgi);

    await updateCreationSession({
      status: "completed",
      selectedCandidateIndex: wizardState.selectedProposalIndex,
      editedFields,
      finalKgi: finalDraft,
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
