import { collection, addDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const roughGoalInput = document.getElementById("roughGoalInput");
const roughReasonInput = document.getElementById("roughReasonInput");
const roughDeadlineInput = document.getElementById("roughDeadlineInput");
const roughCurrentStateInput = document.getElementById("roughCurrentStateInput");
const startDeepDiveButton = document.getElementById("startDeepDiveButton");
const roughSection = document.getElementById("roughSection");
const roughStateChip = document.getElementById("roughStateChip");

const feasibilitySection = document.getElementById("feasibilitySection");
const feasibilityStateChip = document.getElementById("feasibilityStateChip");
const normalizedSummary = document.getElementById("normalizedSummary");
const feasibilityLevelText = document.getElementById("feasibilityLevelText");
const feasibilityReasons = document.getElementById("feasibilityReasons");
const feasibilityAltRoute = document.getElementById("feasibilityAltRoute");
const toQuestionsButton = document.getElementById("toQuestionsButton");

const questionSection = document.getElementById("questionSection");
const questionStateChip = document.getElementById("questionStateChip");
const questionProgress = document.getElementById("questionProgress");
const questionText = document.getElementById("questionText");
const questionAnswerInput = document.getElementById("questionAnswerInput");
const prevQuestionButton = document.getElementById("prevQuestionButton");
const nextQuestionButton = document.getElementById("nextQuestionButton");

const proposalSection = document.getElementById("proposalSection");
const proposalStateChip = document.getElementById("proposalStateChip");
const proposalList = document.getElementById("proposalList");
const editSection = document.getElementById("editSection");
const nameInput = document.getElementById("kgiName");
const goalTextInput = document.getElementById("kgiGoalText");
const deadlineInput = document.getElementById("kgiDeadline");
const levelInput = document.getElementById("kgiLevel");
const saveButton = document.getElementById("saveButton");
const specificityWarningBox = document.getElementById("specificityWarningBox");
const specificityCandidateName = document.getElementById("specificityCandidateName");
const specificityCandidateGoal = document.getElementById("specificityCandidateGoal");
const specificityCandidateDeadline = document.getElementById("specificityCandidateDeadline");
const saveWithSpecificityButton = document.getElementById("saveWithSpecificityButton");
const editSpecificityButton = document.getElementById("editSpecificityButton");

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

const BUSINESS_GOAL_TYPE = {
  AUDIENCE_GROWTH: "audience_growth",
  MONETIZATION_VALIDATION: "monetization_validation",
  OFFER_BUILDING: "offer_building",
  MEDIA_PLATFORM_BUILDING: "media_platform_building",
  PRODUCT_SERVICE_LAUNCH: "product_service_launch",
  BUSINESS_OPERATION_IMPROVEMENT: "business_operation_improvement"
};

const AI_ASSIST_MODE = "rules-plus-writing";

let db;
const wizardState = {
  step: 1,
  sessionId: null,
  roughInput: null,
  normalizedIntent: null,
  inferredGoal: "",
  businessGoalType: "",
  businessGoalTypeReason: "",
  questionTemplateType: "",
  candidateTemplateType: "",
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
  pendingSpecificityPatch: null,
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
  const steps = [step1Label, step2Label, step3Label, step4Label];
  steps.forEach((label, index) => {
    const stepNumber = index + 1;
    label.classList.toggle("active", step === stepNumber);
    label.classList.toggle("completed", step > stepNumber);
  });
  if (typeof updateWizardBlockFocus === "function") {
    updateWizardBlockFocus();
  }
};

const applyBlockState = (section, chip, state, text) => {
  section.dataset.state = state;
  chip.textContent = text;
};

const updateWizardBlockFocus = () => {
  const isQuestionVisible = !questionSection.classList.contains("hidden");

  if (wizardState.step === 1) {
    applyBlockState(roughSection, roughStateChip, "current", "入力中");
    applyBlockState(feasibilitySection, feasibilityStateChip, "future", "これから");
    applyBlockState(questionSection, questionStateChip, "future", "これから");
    applyBlockState(proposalSection, proposalStateChip, "future", "これから");
  } else if (wizardState.step === 2 && !isQuestionVisible) {
    applyBlockState(roughSection, roughStateChip, "completed", "入力済み");
    applyBlockState(feasibilitySection, feasibilityStateChip, "current", "確認中");
    applyBlockState(questionSection, questionStateChip, "future", "これから");
    applyBlockState(proposalSection, proposalStateChip, "future", "これから");
  } else if (wizardState.step === 2 && isQuestionVisible) {
    applyBlockState(roughSection, roughStateChip, "completed", "入力済み");
    applyBlockState(feasibilitySection, feasibilityStateChip, "completed", "確認済み");
    applyBlockState(questionSection, questionStateChip, "current", "回答中");
    applyBlockState(proposalSection, proposalStateChip, "future", "これから");
  } else if (wizardState.step >= 3) {
    applyBlockState(roughSection, roughStateChip, "completed", "入力済み");
    applyBlockState(feasibilitySection, feasibilityStateChip, "completed", "確認済み");
    applyBlockState(questionSection, questionStateChip, "completed", "回答済み");
    applyBlockState(proposalSection, proposalStateChip, "current", wizardState.step === 4 ? "保存中" : "選択中");
  }

  startDeepDiveButton.disabled = wizardState.step > 1 || wizardState.inFlight.startDeepDive;
  toQuestionsButton.disabled = wizardState.step > 2 || wizardState.inFlight.toQuestions;
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

const inferBusinessGoalType = (normalized) => {
  const text = `${normalized.goal} ${normalized.reason} ${normalized.currentState}`.toLowerCase();

  if (/(fx|トレード|取引|検証|勝率|再現性|運用改善|改善|安定収益|ボトルネック)/i.test(text)) {
    return {
      businessGoalType: BUSINESS_GOAL_TYPE.BUSINESS_OPERATION_IMPROVEMENT,
      businessGoalTypeReason: "既存の実行（例: FX取引・運用）の精度や再現性改善を主目的とする語が多いため。"
    };
  }

  if (/(webアプリ|saas|サービス|プロダクト|リリース|公開|β版|ベータ|mvp|初期ユーザー)/i.test(text)) {
    return {
      businessGoalType: BUSINESS_GOAL_TYPE.PRODUCT_SERVICE_LAUNCH,
      businessGoalTypeReason: "新規サービス/プロダクトの公開と初期ユーザー獲得を示す語が中心なため。"
    };
  }

  if (/(初回売上|最初の売上|収益化|マネタイズ|売上を作|成果を確認|3か月以内|検証したい|小さくても収益)/i.test(text)) {
    return {
      businessGoalType: BUSINESS_GOAL_TYPE.MONETIZATION_VALIDATION,
      businessGoalTypeReason: "短期で売上発生の可否を確かめる意図が明確なため。"
    };
  }

  if (/(商品|オファー|note|教材|相談|代行|サポート内容|何を売る|サービス内容|メニュー)/i.test(text)) {
    return {
      businessGoalType: BUSINESS_GOAL_TYPE.OFFER_BUILDING,
      businessGoalTypeReason: "販売する提供価値（商品/オファー）の定義を主目的としているため。"
    };
  }

  if (/(情報サイト|独自ドメイン|メディア|プラットフォーム|土台|発信基盤|オウンドメディア)/i.test(text)) {
    return {
      businessGoalType: BUSINESS_GOAL_TYPE.MEDIA_PLATFORM_BUILDING,
      businessGoalTypeReason: "メディアや発信基盤の構築を優先する意図が読み取れるため。"
    };
  }

  if (/(集客|認知|フォロワー|sns発信|ブログ|xで|youtubeで|見込み客との接点|リーチ)/i.test(text)) {
    return {
      businessGoalType: BUSINESS_GOAL_TYPE.AUDIENCE_GROWTH,
      businessGoalTypeReason: "認知拡大・接点増加を主目的とする語が中心なため。"
    };
  }

  return {
    businessGoalType: BUSINESS_GOAL_TYPE.BUSINESS_OPERATION_IMPROVEMENT,
    businessGoalTypeReason: "明確な型が特定しづらいため、改善指標を置きやすい運用改善型として初期判定。"
  };
};

const assessFeasibility = (normalized, businessGoalType) => {
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

  const textBundle = `${normalized.goal} ${normalized.currentState}`;
  if (businessGoalType === BUSINESS_GOAL_TYPE.AUDIENCE_GROWTH) {
    if (!/人|向け|対象|誰/.test(textBundle)) {
      score += 1;
      reasons.push("誰向けに届けるかが曖昧で、発信軸がぶれやすいです。");
      constraints.push("対象の明確さ");
    }
    if (!/X|Instagram|YouTube|TikTok|ブログ|メルマガ/.test(textBundle)) {
      score += 1;
      reasons.push("主媒体が未確定で、検証設計が立てにくいです。");
      constraints.push("媒体選定");
    }
  } else if (businessGoalType === BUSINESS_GOAL_TYPE.MONETIZATION_VALIDATION) {
    if (!/売上|収益|販売|案件|広告|サブスク|単価/.test(textBundle)) {
      score += 1;
      reasons.push("最初の売上を何で作るかが未定です。");
      constraints.push("収益手段");
    }
    if (!/導線|LP|オファー|提案|販売/.test(textBundle)) {
      score += 1;
      reasons.push("売る導線の情報が不足しており、期限内検証の確度が読みづらいです。");
      constraints.push("売る導線");
    }
  } else if (businessGoalType === BUSINESS_GOAL_TYPE.OFFER_BUILDING) {
    if (!/商品|オファー|教材|相談|代行|サポート/.test(textBundle)) {
      score += 1;
      reasons.push("何を売るかの定義がまだ曖昧です。");
      constraints.push("提供内容");
    }
    if (!/向け|対象|誰/.test(textBundle)) {
      score += 1;
      reasons.push("誰に売るかの解像度が不足しています。");
      constraints.push("ターゲット");
    }
  } else if (businessGoalType === BUSINESS_GOAL_TYPE.MEDIA_PLATFORM_BUILDING) {
    if (!/サイト|ブログ|メディア|プラットフォーム/.test(textBundle)) {
      score += 1;
      reasons.push("媒体の形（サイト/メディア等）がまだ具体化できていません。");
      constraints.push("媒体定義");
    }
    if (!/導線|集客|検索|SNS|メルマガ/.test(textBundle)) {
      score += 1;
      reasons.push("集客導線の想定が不足しています。");
      constraints.push("導線設計");
    }
  } else if (businessGoalType === BUSINESS_GOAL_TYPE.PRODUCT_SERVICE_LAUNCH) {
    if (!/mvp|最小|初期|機能|範囲/.test(textBundle)) {
      score += 1;
      reasons.push("MVPの範囲が未定で、実装過多になるリスクがあります。");
      constraints.push("MVP範囲");
    }
    if (!/初期ユーザー|利用者|ユーザー|顧客/.test(textBundle)) {
      score += 1;
      reasons.push("最初に使ってもらう相手が曖昧です。");
      constraints.push("初期ユーザー");
    }
  } else {
    if (!/改善|再現|検証|勝率|CVR|歩留まり|効率|運用/.test(textBundle)) {
      score += 1;
      reasons.push("何を改善するかの指標が不明確です。");
      constraints.push("改善指標");
    }
    if (!/詰まり|課題|ボトルネック|弱い/.test(textBundle)) {
      score += 1;
      reasons.push("現在のボトルネックが定義されていません。");
      constraints.push("現状課題");
    }
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
  return buildQuestionsByBusinessGoalType(analysis.businessGoalType).map((question, index) => ({ ...question, order: index + 1 }));
};

const buildQuestionsByBusinessGoalType = (businessGoalType) => {
  if (businessGoalType === BUSINESS_GOAL_TYPE.AUDIENCE_GROWTH) {
    return [
      { id: "targetAudience", text: "誰に届けたいですか？" },
      { id: "channel", text: "どの媒体を主軸にしますか？" },
      { id: "availableTime", text: "どれくらいの頻度で発信できますか？" }
    ];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.MONETIZATION_VALIDATION) {
    return [
      { id: "monetizationType", text: "最初の収益は何で作りたいですか？" },
      { id: "firstRevenueTarget", text: "いくらの成果をまず確認したいですか？" },
      { id: "trialCount", text: "期限までに何回試せますか？" }
    ];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.OFFER_BUILDING) {
    return [
      { id: "offerType", text: "何を売る予定ですか？" },
      { id: "targetAudience", text: "誰が買う想定ですか？" },
      { id: "offerValue", text: "その価値を一言で言うと何ですか？" }
    ];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.MEDIA_PLATFORM_BUILDING) {
    return [
      { id: "mediaTheme", text: "どんな情報を届けるサイトですか？" },
      { id: "acquisitionRoute", text: "主な導線は何ですか？" },
      { id: "monetizationType", text: "収益化の方法は何を想定していますか？" }
    ];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.PRODUCT_SERVICE_LAUNCH) {
    return [
      { id: "productOutline", text: "何を作りたいですか？" },
      { id: "earlyUser", text: "最初の利用者は誰ですか？" },
      { id: "launchDoneDefinition", text: "何をもって公開できたとしますか？" }
    ];
  }
  return [
    { id: "currentBottleneck", text: "今いちばん詰まっているのは何ですか？" },
    { id: "improvementMetric", text: "何を改善できたら前進と言えますか？" },
    { id: "weakestPoint", text: "今の数字や状態で一番弱い所はどこですか？" }
  ];
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

  const { businessGoalType, businessGoalTypeReason } = inferBusinessGoalType(normalized);
  const inferredGoal = summarizeGoal(normalized.goal);
  const feasibility = assessFeasibility(normalized, businessGoalType);

  return {
    normalizedIntent: normalized,
    businessGoalType,
    businessGoalTypeReason,
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
  const targetAudience = wizardState.answers.targetAudience || wizardState.answers.earlyUser || "";
  const channel = wizardState.answers.channel || wizardState.answers.acquisitionRoute || wizardState.answers.mediaTheme || "";
  const monetizationType = wizardState.answers.monetizationType || wizardState.answers.offerType || wizardState.answers.improvementMetric || "";
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

const formatDeadlineLabel = (deadline) => {
  if (!deadline) return "期限までに";
  const [year, month, day] = String(deadline).split("-");
  if (!year || !month || !day) return `${deadline}までに`;
  return `${Number(month)}月${Number(day)}日までに`;
};

const buildConcretePlanText = ({ directionId, deadline, audience, channel, monetization, inferredGoal }) => {
  const deadlineLabel = formatDeadlineLabel(deadline);
  const audienceLabel = audience || "届けたい相手";
  const channelLabel = channel || "主な導線";
  const offerLabel = inferredGoal || monetization || "提供内容";

  const planByDirection = {
    touchpoint_growth: {
      title: `${deadlineLabel}${audienceLabel}向けに${channelLabel}で発信し、反応を10件集める`,
      goalText: `${deadline}までに${audienceLabel}向けに${channelLabel}で週3回発信し、コメント・DM・クリックなどの反応を合計10件集める。反応が高いテーマを1つ特定して次月の軸にする。`
    },
    consistent_publishing: {
      title: `${deadlineLabel}${channelLabel}で週3回の発信を8週続ける`,
      goalText: `${deadline}までに${audienceLabel}向けの発信を${channelLabel}で週3回、8週連続で実施する。投稿フォーマットを1つ決め、継続できる運用手順を作って翌月も回せる状態にする。`
    },
    funnel_preparation: {
      title: `${deadlineLabel}${channelLabel}の集客から問い合わせまでの導線を完成させる`,
      goalText: `${deadline}までに${audienceLabel}向けの集客導線を${channelLabel}上で整え、プロフィール・案内文・申込リンクを接続する。導線経由で問い合わせまたは登録を5件獲得して機能確認する。`
    },
    first_sale_validation: {
      title: `${deadlineLabel}${audienceLabel}向けに${offerLabel}を販売し、初回販売1件を作る`,
      goalText: `${deadline}までに${audienceLabel}向けに${offerLabel}を${channelLabel}で案内し、初回販売1件を達成する。販売までの流れを記録し、次回も同じ手順で実行できる状態にする。`
    },
    small_amount_confirmation: {
      title: `${deadlineLabel}小さな商品を1つ販売して収益発生を確認する`,
      goalText: `${deadline}までに${audienceLabel}向けの小さな商品を1つ作り、${channelLabel}で販売して実際の入金を1件確認する。価格・訴求文・申込導線のどれが効いたかを検証メモに残す。`
    },
    offer_response_validation: {
      title: `${deadlineLabel}${channelLabel}で提案を出し、見込み客の反応を10件集める`,
      goalText: `${deadline}までに${audienceLabel}向けオファーを${channelLabel}で提示し、いいね・返信・DM・相談申込を合計10件獲得する。反応率が高い切り口を1つ選び、販売案内文を更新する。`
    },
    offer_definition: {
      title: `${deadlineLabel}初心者向け商品を1つ作り、販売内容を明文化する`,
      goalText: `${deadline}までに${audienceLabel}向けに提供する商品を1つ定義し、対象者・提供内容・価格・提供方法を1ページにまとめる。第三者が読んで内容を説明できる状態を達成する。`
    },
    target_fit: {
      title: `${deadlineLabel}買ってほしい相手を1人に絞り、提案文を作る`,
      goalText: `${deadline}までに${audienceLabel}の中から優先顧客像を1人に絞り、その人向けの提案文を${channelLabel}用に1本作成する。ヒアリングまたは投稿反応で適合性を5件確認する。`
    },
    first_proposal: {
      title: `${deadlineLabel}初回提案を送れる形にし、見込み客へ3件提案する`,
      goalText: `${deadline}までに${audienceLabel}向けの初回提案資料または案内文を完成させ、${channelLabel}経由で見込み客へ3件送る。返信内容をもとに提案の改善点を3つ抽出する。`
    },
    media_foundation: {
      title: `${deadlineLabel}${channelLabel}の基盤を整え、主要コンテンツを3本公開する`,
      goalText: `${deadline}までに${audienceLabel}向けの媒体基盤を整え、プロフィール・導入記事・代表コンテンツを含む3本を${channelLabel}で公開する。初回訪問者が次アクションへ進める構成にする。`
    },
    acquisition_route: {
      title: `${deadlineLabel}流入経路を2本作り、${channelLabel}への訪問を増やす`,
      goalText: `${deadline}までに${audienceLabel}へ届く流入経路を2本設計し、${channelLabel}へ誘導する投稿または導線を実装する。流入データを取得し、どちらが有効か比較できる状態にする。`
    },
    update_consistency: {
      title: `${deadlineLabel}${channelLabel}の更新を週2回で8週間継続する`,
      goalText: `${deadline}までに${audienceLabel}向けの更新を${channelLabel}で週2回、8週間継続する。更新テンプレートと作業時間の目安を決め、継続運用できる手順を固定化する。`
    },
    mvp_launch: {
      title: `${deadlineLabel}最小版を公開し、利用開始できる状態にする`,
      goalText: `${deadline}までに${audienceLabel}向けの最小版サービス（MVP）を公開し、申込または利用開始まで完了できる状態にする。初回ユーザー3人の利用ログを取得して改善点を整理する。`
    },
    early_user_validation: {
      title: `${deadlineLabel}初期ユーザーを3人集めて利用検証を完了する`,
      goalText: `${deadline}までに${audienceLabel}から初期ユーザー3人を獲得し、${channelLabel}経由で利用検証を実施する。利用後フィードバックを回収し、改善優先順位を決める。`
    },
    release_readiness: {
      title: `${deadlineLabel}公開前の必須準備を完了し、公開判定を出せる状態にする`,
      goalText: `${deadline}までに${audienceLabel}向け公開に必要な案内文・利用手順・問い合わせ対応を整備する。チェックリストを完了し、公開可否を判断できる状態にする。`
    },
    bottleneck_improvement: {
      title: `${deadlineLabel}詰まり工程を1つ改善し、成果までの時間を短縮する`,
      goalText: `${deadline}までに現在の作業で最も詰まる工程を1つ特定し、${channelLabel}での運用手順を改善する。1回あたりの作業時間を20%短縮し、実行記録を4週分残す。`
    },
    reproducibility: {
      title: `${deadlineLabel}成果が出た手順をテンプレ化し、同条件で3回再現する`,
      goalText: `${deadline}までに${audienceLabel}向け施策で成果が出た手順をテンプレート化し、${channelLabel}で同条件の実行を3回行う。結果差分を記録し、再現率を確認する。`
    },
    validation_habit: {
      title: `${deadlineLabel}週1回の検証ループを8週続け、改善ログを残す`,
      goalText: `${deadline}までに${audienceLabel}向けの施策について、${channelLabel}で週1回の実行→振り返り→改善を8週連続で回す。改善ログを8件残し、次に伸ばす指標を1つ決める。`
    }
  };

  const fallback = {
    title: `${deadlineLabel}${audienceLabel}向けに${channelLabel}で実行し、前進指標を達成する`,
    goalText: `${deadline}までに${audienceLabel}向けに${offerLabel}を${channelLabel}で実行し、反応や申込など前進を示す指標を達成する。達成条件と次の改善点を明文化する。`
  };

  return planByDirection[directionId] || fallback;
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

  const levels = ["easy", "normal", "detailed"];
  const directionBases = wizardState.candidateDirections.length > 0
    ? wizardState.candidateDirections
    : buildCandidateDirectionsByBusinessGoalType(wizardState.businessGoalType, feasibilityLevel);

  return directionBases.slice(0, 3).map((direction, index) => {
    const concretePlan = buildConcretePlanText({
      directionId: direction.id,
      deadline,
      audience,
      channel,
      monetization,
      inferredGoal
    });
    return {
    candidateType: direction.id,
    directionLabel: direction.title,
    name: concretePlan.title,
    goalText: concretePlan.goalText,
    deadline,
    level: levels[index] || "normal",
    reason: direction.reason,
    concerns: direction.concern
    };
  });
};

const buildCandidateDirectionsByBusinessGoalType = (businessGoalType, feasibilityLevel) => {
  const scopePrefix = feasibilityLevel === FEASIBILITY_LEVEL.HARD ? "短期検証を優先しつつ" : "";
  if (businessGoalType === BUSINESS_GOAL_TYPE.AUDIENCE_GROWTH) {
    return [
      { id: "touchpoint_growth", title: "接点拡大型", direction: "接点拡大", baseGoalText: `${scopePrefix}届けたい相手への接点を増やす`, reason: "まず認知と接点を作りたい人向け", concern: "売上への接続設計が必要" },
      { id: "consistent_publishing", title: "継続発信型", direction: "継続発信", baseGoalText: `${scopePrefix}無理なく継続できる発信体制を作る`, reason: "発信習慣を安定させたい人向け", concern: "短期成果は出にくい" },
      { id: "funnel_preparation", title: "導線整備型", direction: "導線整備", baseGoalText: `${scopePrefix}集客から次アクションへの導線を整える`, reason: "反応を行動に変換したい人向け", concern: "設計作業が増える" }
    ];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.MONETIZATION_VALIDATION) {
    return [
      { id: "first_sale_validation", title: "初回売上検証型", direction: "初回売上検証", baseGoalText: `${scopePrefix}最初の売上1件を作り検証完了する`, reason: "収益化の可否を早く確認したい人向け", concern: "短期で試行回数が必要" },
      { id: "small_amount_confirmation", title: "小額成果確認型", direction: "小額成果確認", baseGoalText: `${scopePrefix}小さな金額でも収益発生を確認する`, reason: "低リスクで検証したい人向け", concern: "規模拡大は別設計が必要" },
      { id: "offer_response_validation", title: "オファー反応検証型", direction: "反応検証", baseGoalText: `${scopePrefix}オファー提示への反応率を測る`, reason: "売れる切り口を見極めたい人向け", concern: "反応が低い時の改善前提" }
    ];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.OFFER_BUILDING) {
    return [
      { id: "offer_definition", title: "商品明確化型", direction: "商品明確化", baseGoalText: `${scopePrefix}販売する商品内容を定義する`, reason: "提供内容を固めたい人向け", concern: "販売検証は次段階" },
      { id: "target_fit", title: "ターゲット適合型", direction: "ターゲット適合", baseGoalText: `${scopePrefix}誰向けの商品かを明確にする`, reason: "刺さる顧客像を合わせたい人向け", concern: "提供物の磨き込みが必要" },
      { id: "first_proposal", title: "初回提案作成型", direction: "初回提案作成", baseGoalText: `${scopePrefix}初回提案用オファーを作成する`, reason: "すぐ提案可能な形を作りたい人向け", concern: "検証行動が必須" }
    ];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.MEDIA_PLATFORM_BUILDING) {
    return [
      { id: "media_foundation", title: "情報基盤構築型", direction: "基盤構築", baseGoalText: `${scopePrefix}媒体の土台と主要コンテンツを整備する`, reason: "中長期の発信土台を作りたい人向け", concern: "初速が遅くなりやすい" },
      { id: "acquisition_route", title: "集客導線整備型", direction: "導線整備", baseGoalText: `${scopePrefix}流入導線を設計して運用を開始する`, reason: "集客経路を先に固めたい人向け", concern: "導線ごとの計測設計が必要" },
      { id: "update_consistency", title: "更新継続型", direction: "更新継続", baseGoalText: `${scopePrefix}更新を継続できる運用を定着させる`, reason: "運用の継続性を重視したい人向け", concern: "短期成果は見えづらい" }
    ];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.PRODUCT_SERVICE_LAUNCH) {
    return [
      { id: "mvp_launch", title: "MVP公開型", direction: "MVP公開", baseGoalText: `${scopePrefix}最小機能で公開し利用可能状態にする`, reason: "早く公開して学習したい人向け", concern: "品質期待値の調整が必要" },
      { id: "early_user_validation", title: "初期ユーザー検証型", direction: "初期ユーザー検証", baseGoalText: `${scopePrefix}初期ユーザー利用を獲得して検証する`, reason: "利用実績を先に作りたい人向け", concern: "集客動線が別途必要" },
      { id: "release_readiness", title: "公開準備完了型", direction: "公開準備", baseGoalText: `${scopePrefix}公開条件を満たす準備を完了する`, reason: "リスクを抑えて公開したい人向け", concern: "公開時期が遅れる可能性" }
    ];
  }
  return [
    {
      id: "bottleneck_improvement",
      title: "ボトルネック改善型",
      direction: "ボトルネック改善",
      baseGoalText: `${scopePrefix}詰まりポイントを特定し改善する`,
      reason: "課題箇所を明確にして進めたい人向け",
      concern: "現状把握の精度が必要"
    },
    {
      id: "reproducibility",
      title: "再現性向上型",
      direction: "再現性向上",
      baseGoalText: `${scopePrefix}成果が出る手順を再現可能にする`,
      reason: "安定的な成果を目指す人向け",
      concern: "検証記録が不可欠"
    },
    {
      id: "validation_habit",
      title: "検証習慣化型",
      direction: "検証習慣化",
      baseGoalText: `${scopePrefix}改善サイクルを週次で回せる状態を作る`,
      reason: "運用改善を習慣化したい人向け",
      concern: "短期で大きな変化は出にくい"
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
      <p class="proposal-meta"><small><strong>方向タイプ:</strong> ${proposal.directionLabel || "未設定"}</small></p>
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
      hideSpecificityWarning();
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

const hideSpecificityWarning = () => {
  wizardState.pendingSpecificityPatch = null;
  if (!specificityWarningBox) return;
  specificityWarningBox.classList.add("hidden");
  if (saveButton) {
    saveButton.hidden = false;
    saveButton.disabled = !db;
  }
};

const showSpecificityWarning = (specificityPatch) => {
  wizardState.pendingSpecificityPatch = specificityPatch;
  if (!specificityWarningBox) return;
  specificityCandidateName.textContent = `KGI名: ${specificityPatch.suggestedName}`;
  specificityCandidateGoal.textContent = `ゴール説明: ${specificityPatch.suggestedGoal}`;
  specificityCandidateDeadline.textContent = `期限: ${specificityPatch.normalizedDeadline}`;
  specificityWarningBox.classList.remove("hidden");
  if (saveButton) {
    saveButton.hidden = true;
    saveButton.disabled = true;
  }
};

const getInputDraft = () => {
  const name = (nameInput.value || "").trim();
  const goalText = (goalTextInput.value || "").trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = formatDateInputValue(today);
  const deadline = deadlineInput.value || formatDateInputValue(addDays(today, DEFAULT_KGI_DURATION_DAYS));
  const level = levelInput.value || "normal";
  return { name, goalText, startDate, deadline, level };
};

const persistKgi = async ({ finalDraft, startDate, level }) => {
  setButtonBusy(saveButton, true, "保存中...");
  setButtonBusy(saveWithSpecificityButton, true, "保存中...");
  if (editSpecificityButton) editSpecificityButton.disabled = true;

  const selectedOriginal = wizardState.proposals[wizardState.selectedProposalIndex];
  const selectedCandidateType = selectedOriginal?.directionLabel || "";
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
        businessGoalType: wizardState.businessGoalType,
        businessGoalTypeReason: wizardState.businessGoalTypeReason,
        questionTemplateType: wizardState.questionTemplateType,
        candidateTemplateType: wizardState.candidateTemplateType,
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
          businessGoalType: wizardState.businessGoalType,
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
    throw error;
  } finally {
    setButtonBusy(saveButton, false);
    setButtonBusy(saveWithSpecificityButton, false);
    if (editSpecificityButton) editSpecificityButton.disabled = false;
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
    businessGoalType: wizardState.businessGoalType,
    businessGoalTypeReason: wizardState.businessGoalTypeReason,
    questionTemplateType: wizardState.questionTemplateType,
    candidateTemplateType: wizardState.candidateTemplateType,
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
    wizardState.businessGoalType = analysis.businessGoalType;
    wizardState.businessGoalTypeReason = analysis.businessGoalTypeReason;
    wizardState.questionTemplateType = analysis.businessGoalType;
    wizardState.candidateTemplateType = analysis.businessGoalType;
    wizardState.inferredGoal = analysis.inferredGoal;
    wizardState.uncertaintyFields = analysis.uncertaintyFields;
    wizardState.feasibility = analysis.feasibility;
    wizardState.questions = buildDynamicQuestions(analysis);
    wizardState.dynamicQuestionsBase = wizardState.questions.map((question) => ({ ...question }));
    wizardState.candidateDirections = buildCandidateDirectionsByBusinessGoalType(
      analysis.businessGoalType,
      analysis.feasibility.feasibilityLevel
    );
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
          businessGoalType: wizardState.businessGoalType,
          businessGoalTypeReason: wizardState.businessGoalTypeReason,
          questionTemplateType: wizardState.questionTemplateType,
          candidateTemplateType: wizardState.candidateTemplateType,
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
    updateWizardBlockFocus();
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
    updateWizardBlockFocus();
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
          businessGoalType: wizardState.businessGoalType,
          businessGoalTypeReason: wizardState.businessGoalTypeReason,
          questionTemplateType: wizardState.questionTemplateType,
          candidateTemplateType: wizardState.candidateTemplateType,
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
    updateWizardBlockFocus();
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
updateWizardBlockFocus();

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

  const { name, goalText, startDate, deadline, level } = getInputDraft();

  if (!name) {
    alert("KGI名を入力してください。");
    endInFlight("saveKgi");
    return;
  }

  const specificityPatch = buildSpecificityPatch({ name, goalText, deadline });
  if (specificityPatch.missing.length > 0) {
    showSpecificityWarning(specificityPatch);
    setStatus("補正候補を表示しました。「この補正で保存する」か「自分で直す」を選んでください。", true);
    endInFlight("saveKgi");
    return;
  }

  hideSpecificityWarning();
  const finalDraft = {
    name,
    goalText,
    deadline,
    level
  };

  try {
    await persistKgi({ finalDraft, startDate, level });
  } catch (_error) {
    endInFlight("saveKgi");
    return;
  }
});

saveWithSpecificityButton.addEventListener("click", async () => {
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
  const { name, goalText, startDate, deadline, level } = getInputDraft();
  const specificityPatch = wizardState.pendingSpecificityPatch || buildSpecificityPatch({ name, goalText, deadline });
  const finalDraft = {
    name: specificityPatch.suggestedName,
    goalText: specificityPatch.suggestedGoal,
    deadline: specificityPatch.normalizedDeadline,
    level
  };

  hideSpecificityWarning();
  try {
    await persistKgi({ finalDraft, startDate, level });
  } catch (_error) {
    endInFlight("saveKgi");
    return;
  }
});

editSpecificityButton.addEventListener("click", () => {
  hideSpecificityWarning();
  goalTextInput.focus();
  setStatus("手動で編集できます。編集後は「この内容で保存」を1回押すと保存されます。", false);
});
