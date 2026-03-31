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

const AI_ASSIST_MODE = "rules-plus-writing";

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
  dynamicQuestionsBase: [],
  currentQuestionIndex: 0,
  answers: {},
  askedQuestions: [],
  questionTextsById: {},
  proposals: [],
  candidateDirections: [],
  selectedProposalIndex: -1,
  selectedDraft: null,
  tags: {},
  aiWriting: {
    normalizedSummaryText: "",
    feasibilityReasonText: "",
    scopeAdjustmentText: "",
    questionTexts: [],
    candidateTexts: []
  },
  inFlight: {},
  actionTokenSeq: {}
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

const beginInFlight = (key) => {
  if (wizardState.inFlight[key]) return null;
  wizardState.inFlight[key] = true;
  wizardState.actionTokenSeq[key] = (wizardState.actionTokenSeq[key] || 0) + 1;
  return wizardState.actionTokenSeq[key];
};

const isLatestToken = (key, token) => wizardState.actionTokenSeq[key] === token;
const endInFlight = (key) => {
  wizardState.inFlight[key] = false;
};

const setButtonBusy = (button, busy, busyText) => {
  if (!button) return;
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent || "";
  }
  button.disabled = !!busy;
  button.textContent = busy ? busyText : (button.dataset.defaultText || "");
};

const generateRoadmap = async (kgiData) => {
  const response = await fetch("/api/generate-roadmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: kgiData.name ?? "",
      goalText: kgiData.goalText ?? "",
      deadline: kgiData.deadline ?? "",
      level: kgiData.level ?? "normal",
      context: kgiData.context ?? {}
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
  const concreteNameBase = `${audience}向け${channel}発信と${monetization}導線`;

  return [
    {
      candidateType: "awareness",
      directionLabel: "認知拡大型",
      name: `${concreteNameBase}の初期検証基盤づくり`,
      goalText: `${deadline}までに${audience}向けに届ける内容を明確化し、${channel}で発信検証を回して、${scopePrefix}${monetization}につながる初回成果を1件作る。`,
      deadline,
      level: "easy",
      reason: "最小の成果を先に作って実現可能性を上げる案です。厳しめの条件でも前進実感を得やすいです。",
      concerns: "大きな売上目標は次段階に回す必要があります。"
    },
    {
      candidateType: "monetize",
      directionLabel: "収益化優先型",
      name: `${concreteNameBase}の収益化立ち上げ`,
      goalText: `${deadline}までに「${inferredGoal}」を土台に、${audience}向けの提供内容を${channel}で届け、${monetization}のオファー実装まで完了する。`,
      deadline,
      level: "normal",
      reason: "成果に近い行動を優先しつつ、期限内で必要な要素をバランスよく進める案です。",
      concerns: "運用時間が少ないと実行密度が不足しやすいです。"
    },
    {
      candidateType: "consistency",
      directionLabel: "継続重視型",
      name: `${concreteNameBase}の継続運用体制づくり`,
      goalText: `${deadline}までに${audience}向けの${channel}運用を週次で継続できる形に整え、${monetization}検証につながる行動を再現可能にする。`,
      deadline,
      level: "detailed",
      reason: "忙しい状況でも継続しやすく、途中離脱を防ぎながら長期成果につなげる案です。",
      concerns: "短期の数値成果が見えるまで時間がかかることがあります。"
    }
  ];
};

const buildCandidateDirections = (feasibilityLevel) => {
  const scopePrefix = feasibilityLevel === FEASIBILITY_LEVEL.HARD ? "短期検証を優先しつつ" : "";
  return [
    {
      id: "awareness",
      title: "認知拡大型",
      direction: "認知拡大",
      baseGoalText: `${scopePrefix}届けたい相手への接点を増やし、反応データを集める`,
      reason: "市場の反応を早く集めたい人向け",
      concern: "短期売上は見えにくい"
    },
    {
      id: "monetize",
      title: "収益化優先型",
      direction: "収益化優先",
      baseGoalText: `${scopePrefix}見込み顧客導線とオファーを整え、成果発生を狙う`,
      reason: "期限内の成果を重視したい人向け",
      concern: "準備項目が多く、時間不足だと詰まりやすい"
    },
    {
      id: "consistency",
      title: "継続重視型",
      direction: "継続重視",
      baseGoalText: `${scopePrefix}週次運用の習慣化を先に作り、再現性を高める`,
      reason: "忙しい中でも続ける土台を作りたい人向け",
      concern: "即効性は低め"
    }
  ];
};

const fallbackAiWritingResult = ({ normalizedIntent, feasibility, questions, proposals }) => ({
  normalizedSummaryText: `やりたいことは「${normalizedIntent.goal || "未入力"}」、背景は「${normalizedIntent.reason || "未入力"}」、期限は「${normalizedIntent.deadline || "未設定"}」として整理しました。`,
  feasibilityReasonText: (feasibility?.feasibilityReasons || []).join(" "),
  scopeAdjustmentText: feasibility?.recommendedScopeChange || "",
  questionTexts: (questions || []).map((question) => ({ id: question.id, text: question.text })),
  candidateTexts: (proposals || []).map((proposal) => ({
    title: proposal.name,
    goalText: proposal.goalText,
    reasonText: proposal.reason,
    concernText: proposal.concerns
  }))
});

const callAiWritingPolish = async ({ payload }) => {
  const response = await fetch("/api/polish-kgi-wizard-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "AI文章化APIに失敗しました");
  }
  return response.json();
};

const renderFeasibilityBlock = () => {
  const normalized = wizardState.normalizedIntent;
  const feasibility = wizardState.feasibility;
  if (!normalized || !feasibility) return;

  const summaryText = wizardState.aiWriting.normalizedSummaryText || `やりたいことは「${normalized.goal || "未入力"}」、背景は「${normalized.reason || "未入力"}」、期限は「${normalized.deadline || "未設定"}」です。`;
  normalizedSummary.innerHTML = `<li>${summaryText}</li>`;

  feasibilityLevelText.textContent = feasibility.feasibilityLevel;
  const reasonText = wizardState.aiWriting.feasibilityReasonText || feasibility.feasibilityReasons.join(" ");
  feasibilityReasons.innerHTML = `<li>${reasonText}</li>`;

  const scopeAdjustmentText = wizardState.aiWriting.scopeAdjustmentText || feasibility.recommendedScopeChange;
  if (feasibility.feasibilityLevel === FEASIBILITY_LEVEL.HARD || scopeAdjustmentText) {
    feasibilityAltRoute.classList.remove("hidden");
    feasibilityAltRoute.textContent = scopeAdjustmentText;
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
      <p class="proposal-meta"><strong>方向タイプ:</strong> ${proposal.directionLabel || "未設定"}</p>
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
      if (wizardState.inFlight.selectProposal) return;
      setButtonBusy(button, true, "反映中...");
      wizardState.inFlight.selectProposal = true;
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
      wizardState.inFlight.selectProposal = false;
    });
  });
};

const ABSTRACT_LABEL_PATTERN = /^(認知拡大型|収益化優先型|継続重視型|検証優先型|成果直結型|習慣化重視型|方向性)/;
const CHANNEL_PATTERN = /(X|Instagram|YouTube|TikTok|ブログ|メルマガ|LINE|サイト|note)/i;
const MONETIZE_PATTERN = /(収益|売上|広告|案件|サブスク|販売|商品|サービス|アフィリエイト|単価)/;
const DELIVERY_PATTERN = /(記事|投稿|動画|教材|サービス|商品|情報|コンテンツ|発信|提供)/;
const AUDIENCE_PATTERN = /(向け|対象|初心者|会社員|学生|主婦|経営者|フリーランス|個人事業主|保護者)/;

const buildSpecificityPatch = ({ name, goalText, deadline }) => {
  const audience = wizardState.tags.targetAudience || wizardState.answers.targetAudience || wizardState.normalizedIntent?.goal || "";
  const channel = wizardState.tags.channel || wizardState.answers.channel || "";
  const monetization = wizardState.tags.monetizationType || wizardState.answers.monetizationType || "";
  const baseGoal = wizardState.roughInput?.roughGoal || wizardState.normalizedIntent?.goal || "";
  const availability = wizardState.answers.availableTime || wizardState.normalizedIntent?.currentState || "";
  const candidateType = wizardState.proposals[wizardState.selectedProposalIndex]?.directionLabel || "未設定";

  const textBundle = `${name} ${goalText}`;
  const missing = [];
  if (!AUDIENCE_PATTERN.test(textBundle)) missing.push("誰向けか");
  if (!DELIVERY_PATTERN.test(textBundle)) missing.push("何を届けるか");
  if (!CHANNEL_PATTERN.test(textBundle)) missing.push("主な媒体/導線");
  if (!MONETIZE_PATTERN.test(textBundle)) missing.push("収益化の方向");
  if (!deadline) missing.push("期限");

  const normalizedDeadline = deadline || wizardState.roughInput?.deadline || formatDateInputValue(addDays(new Date(), DEFAULT_KGI_DURATION_DAYS));
  const suggestedNameBase = `${audience || "想定顧客"}向け${channel || "発信導線"}と${monetization || "収益化"}の立ち上げ`;
  const suggestedName = (!name || ABSTRACT_LABEL_PATTERN.test(name))
    ? suggestedNameBase
    : name;

  let suggestedGoal = goalText;
  if (missing.length > 0 || goalText.length < 35) {
    suggestedGoal = `${normalizedDeadline}までに${audience || "想定顧客"}向けへ${baseGoal || "価値提供内容"}を${channel || "主導線"}で届け、${monetization || "初回収益化"}の検証を完了する。`;
    if (availability) {
      suggestedGoal += ` 使える時間は${availability}を前提に週次で実行する。`;
    }
    suggestedGoal += `（候補タイプ: ${candidateType}）`;
  }

  return {
    missing,
    suggestedName,
    suggestedGoal,
    normalizedDeadline
  };
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
    flowVersion: "in-app-ai-wizard-v3-rules-plus-writing",
    aiAssistMode: AI_ASSIST_MODE,
    status: "rough_input_received",
    rawInput: wizardState.roughInput,
    normalizedIntent: wizardState.normalizedIntent,
    inferredGoal: wizardState.inferredGoal,
    uncertaintyFields: wizardState.uncertaintyFields,
    feasibilityLevel: wizardState.feasibility?.feasibilityLevel || "",
    feasibilityReasons: wizardState.feasibility?.feasibilityReasons || [],
    mainConstraints: wizardState.feasibility?.mainConstraints || [],
    recommendedScopeChange: wizardState.feasibility?.recommendedScopeChange || "",
    dynamicQuestionsBase: wizardState.dynamicQuestionsBase,
    candidateDirections: wizardState.candidateDirections,
    askedQuestions: wizardState.questions,
    aiWritingResult: wizardState.aiWriting,
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
  const actionToken = beginInFlight("startDeepDive");
  if (!actionToken) return;
  setButtonBusy(startDeepDiveButton, true, "処理中...");
  try {
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
    wizardState.dynamicQuestionsBase = wizardState.questions.map((question) => ({ ...question }));
    wizardState.candidateDirections = buildCandidateDirections(analysis.feasibility.feasibilityLevel);
    wizardState.askedQuestions = wizardState.questions;
    wizardState.currentQuestionIndex = 0;
    wizardState.answers = {};

    const ready = await ensureCreationSession();
    if (!ready) return;

  const fallbackWriting = fallbackAiWritingResult({
    normalizedIntent: wizardState.normalizedIntent,
    feasibility: wizardState.feasibility,
    questions: wizardState.questions,
    proposals: []
  });
  wizardState.aiWriting = { ...wizardState.aiWriting, ...fallbackWriting };
  try {
    const aiResult = await callAiWritingPolish({
      payload: {
        rawInput: wizardState.roughInput,
        normalizedIntent: wizardState.normalizedIntent,
        inferredGoal: wizardState.inferredGoal,
        uncertaintyFields: wizardState.uncertaintyFields,
        feasibilityLevel: wizardState.feasibility.feasibilityLevel,
        feasibilityReasons: wizardState.feasibility.feasibilityReasons,
        mainConstraints: wizardState.feasibility.mainConstraints,
        recommendedScopeChange: wizardState.feasibility.recommendedScopeChange,
        dynamicQuestions: wizardState.dynamicQuestionsBase,
        candidateDirections: wizardState.candidateDirections
      }
    });
    wizardState.aiWriting = { ...wizardState.aiWriting, ...aiResult };
  } catch (error) {
    console.warn("AI文章化に失敗したためフォールバック文面を使用します", error);
  }

  wizardState.questionTextsById = Object.fromEntries(
    (wizardState.aiWriting.questionTexts || []).map((question) => [question.id, question.text])
  );
  wizardState.questions = wizardState.questions.map((question) => ({
    ...question,
    text: wizardState.questionTextsById[question.id] || question.text
  }));

  await updateCreationSession({
    aiWritingResult: wizardState.aiWriting,
    dynamicQuestionsBase: wizardState.dynamicQuestionsBase,
    candidateDirections: wizardState.candidateDirections
  });

    if (!isLatestToken("startDeepDive", actionToken)) return;
    renderFeasibilityBlock();
    feasibilitySection.classList.remove("hidden");
    questionSection.classList.add("hidden");
    proposalSection.classList.add("hidden");
    setStep(2);
    setStatus("入力内容を整理し、実現可能性チェックを作成しました。", false);
  } catch (error) {
    console.error(error);
    setStatus("入力整理でエラーが発生しました。時間をおいて再試行してください。", true);
  } finally {
    endInFlight("startDeepDive");
    setButtonBusy(startDeepDiveButton, false);
  }
});

toQuestionsButton.addEventListener("click", async () => {
  const actionToken = beginInFlight("toQuestions");
  if (!actionToken) return;
  setButtonBusy(toQuestionsButton, true, "処理中...");
  try {
    questionSection.classList.remove("hidden");
    renderQuestion();
    await updateCreationSession({
      status: "questioning",
      askedQuestions: wizardState.questions
    });
    setStep(2);
    setStatus("不足している点だけ質問します。", false);
  } finally {
    if (isLatestToken("toQuestions", actionToken)) {
      endInFlight("toQuestions");
      setButtonBusy(toQuestionsButton, false);
    }
  }
});

prevQuestionButton.addEventListener("click", () => {
  saveAnswerFromField();
  if (wizardState.currentQuestionIndex > 0) {
    wizardState.currentQuestionIndex -= 1;
    renderQuestion();
  }
});

nextQuestionButton.addEventListener("click", async () => {
  const actionToken = beginInFlight("nextQuestion");
  if (!actionToken) return;
  const lastQuestionIndex = wizardState.questions.length - 1;
  setButtonBusy(nextQuestionButton, true, wizardState.currentQuestionIndex === lastQuestionIndex ? "候補作成中..." : "処理中...");
  try {
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
    const fallbackAfterQuestions = fallbackAiWritingResult({
      normalizedIntent: wizardState.normalizedIntent,
      feasibility: wizardState.feasibility,
      questions: wizardState.questions,
      proposals: wizardState.proposals
    });
    wizardState.aiWriting = { ...wizardState.aiWriting, ...fallbackAfterQuestions };
    try {
      const aiResult = await callAiWritingPolish({
        payload: {
          rawInput: wizardState.roughInput,
          normalizedIntent: wizardState.normalizedIntent,
          inferredGoal: wizardState.inferredGoal,
          uncertaintyFields: wizardState.uncertaintyFields,
          feasibilityLevel: wizardState.feasibility.feasibilityLevel,
          feasibilityReasons: wizardState.feasibility.feasibilityReasons,
          mainConstraints: wizardState.feasibility.mainConstraints,
          recommendedScopeChange: wizardState.feasibility.recommendedScopeChange,
          dynamicQuestions: wizardState.dynamicQuestionsBase,
          candidateDirections: wizardState.candidateDirections,
          candidateBases: wizardState.proposals.map((proposal, index) => ({
            index,
            title: proposal.name,
            goalText: proposal.goalText,
            reasonText: proposal.reason,
            concernText: proposal.concerns
          }))
        }
      });
      wizardState.aiWriting = { ...wizardState.aiWriting, ...aiResult };
    } catch (error) {
      console.warn("AI文章化(候補)に失敗したためフォールバック文面を使用します", error);
    }
    if (Array.isArray(wizardState.aiWriting.candidateTexts) && wizardState.aiWriting.candidateTexts.length > 0) {
      wizardState.proposals = wizardState.proposals.map((proposal, index) => {
        const polished = wizardState.aiWriting.candidateTexts[index];
        if (!polished) return proposal;
        return {
          ...proposal,
          name: polished.title || proposal.name,
          goalText: polished.goalText || proposal.goalText,
          reason: polished.reasonText || proposal.reason,
          concerns: polished.concernText || proposal.concerns
        };
      });
    }
    if (!isLatestToken("nextQuestion", actionToken)) return;
    proposalSection.classList.remove("hidden");
    setStep(3);
    renderProposals();

    await updateCreationSession({
      status: "proposal_ready",
      tags: wizardState.tags,
      generatedCandidates: wizardState.proposals,
      aiWritingResult: wizardState.aiWriting
    });

    setStatus("KGI候補を作成しました。使いたい案を選んでください。", false);
  } finally {
    endInFlight("nextQuestion");
    setButtonBusy(nextQuestionButton, false);
  }
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
  const actionToken = beginInFlight("saveKgi");
  if (!actionToken) return;
  if (!db) {
    alert("Firebase接続を初期化中です。数秒後に再試行してください。");
    endInFlight("saveKgi");
    return;
  }

  if (wizardState.selectedProposalIndex < 0) {
    alert("先にKGI候補を1つ選んでください。");
    endInFlight("saveKgi");
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
    endInFlight("saveKgi");
    return;
  }

  const specificityPatch = buildSpecificityPatch({ name, goalText, deadline });
  if (specificityPatch.missing.length > 0) {
    nameInput.value = specificityPatch.suggestedName;
    goalTextInput.value = specificityPatch.suggestedGoal;
    deadlineInput.value = specificityPatch.normalizedDeadline;
    const warningMessage = `このKGIは方向性は分かりますが、${specificityPatch.missing.join("・")}が少し抽象的です。具体性を補う候補を自動反映したので、内容を確認してもう一度保存してください。`;
    setStatus(warningMessage, true);
    alert(warningMessage);
    endInFlight("saveKgi");
    return;
  }

  setButtonBusy(saveButton, true, "保存中...");

  const selectedOriginal = wizardState.proposals[wizardState.selectedProposalIndex];
  const selectedCandidateType = selectedOriginal?.directionLabel || "";
  const finalDraft = {
    name: specificityPatch.suggestedName,
    goalText: specificityPatch.suggestedGoal,
    deadline: specificityPatch.normalizedDeadline,
    level
  };
  const editedFields = Object.keys(finalDraft).filter((key) => finalDraft[key] !== selectedOriginal[key]);

  try {
    const createdKgi = {
      name: finalDraft.name,
      goalText: finalDraft.goalText,
      deadline: finalDraft.deadline,
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
        flowVersion: "in-app-ai-wizard-v3-rules-plus-writing",
        aiAssistMode: AI_ASSIST_MODE,
        rawInput: wizardState.roughInput,
        normalizedIntent: wizardState.normalizedIntent,
        inferredGoal: wizardState.inferredGoal,
        uncertaintyFields: wizardState.uncertaintyFields,
        feasibilityLevel: wizardState.feasibility?.feasibilityLevel || "",
        feasibilityReasons: wizardState.feasibility?.feasibilityReasons || [],
        mainConstraints: wizardState.feasibility?.mainConstraints || [],
        recommendedScopeChange: wizardState.feasibility?.recommendedScopeChange || "",
        dynamicQuestionsBase: wizardState.dynamicQuestionsBase,
        candidateDirections: wizardState.candidateDirections,
        normalizedSummaryText: wizardState.aiWriting.normalizedSummaryText || "",
        feasibilityReasonText: wizardState.aiWriting.feasibilityReasonText || "",
        scopeAdjustmentText: wizardState.aiWriting.scopeAdjustmentText || "",
        questionTexts: wizardState.aiWriting.questionTexts || [],
        candidateTexts: wizardState.aiWriting.candidateTexts || [],
        askedQuestions: wizardState.questions,
        userAnswers: wizardState.answers,
        tags: wizardState.tags,
        selectedCandidateType,
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
      const generated = await generateRoadmap({
        name: finalDraft.name,
        goalText: finalDraft.goalText,
        deadline: finalDraft.deadline,
        level,
        context: {
          rawInput: wizardState.roughInput,
          normalizedIntent: wizardState.normalizedIntent,
          targetAudience: wizardState.tags.targetAudience || "",
          channel: wizardState.tags.channel || "",
          monetizationType: wizardState.tags.monetizationType || "",
          availableTime: wizardState.tags.availableTime || wizardState.answers.availableTime || "",
          feasibilityReasons: wizardState.feasibility?.feasibilityReasons || [],
          selectedCandidateType,
          finalKgi: finalDraft
        }
      });
      if (Array.isArray(generated.roadmapPhases) && generated.roadmapPhases.length > 0) {
        await updateDoc(doc(db, "kgis", kgiDocRef.id), {
          roadmapPhases: generated.roadmapPhases,
          goalText: generated.kgiDescription || finalDraft.goalText,
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
    endInFlight("saveKgi");
    setButtonBusy(saveButton, false);
  }
});
