import { collection, addDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";
import { enhanceReadableText } from "./readable-text.js";

const roughGoalInput = document.getElementById("roughGoalInput");
const roughReasonInput = document.getElementById("roughReasonInput");
const roughDeadlineInput = document.getElementById("roughDeadlineInput");
const roughCurrentStateInput = document.getElementById("roughCurrentStateInput");
const startDeepDiveButton = document.getElementById("startDeepDiveButton");
const roughSection = document.getElementById("roughSection");
const roughStateChip = document.getElementById("roughStateChip");

const feasibilitySection = document.getElementById("feasibilitySection");
const feasibilityStateChip = document.getElementById("feasibilityStateChip");
const normalizedSummaryText = document.getElementById("normalizedSummaryText");
const feasibilityLevelText = document.getElementById("feasibilityLevelText");
const feasibilityReasonsText = document.getElementById("feasibilityReasonsText");
const feasibilityAltRouteLabel = document.getElementById("feasibilityAltRouteLabel");
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
const understandingCheckSection = document.getElementById("understandingCheckSection");
const understandingSummaryText = document.getElementById("understandingSummaryText");
const confirmUnderstandingButton = document.getElementById("confirmUnderstandingButton");
const reviseUnderstandingButton = document.getElementById("reviseUnderstandingButton");
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

const renderReadableLongText = (element, text, options = {}) => {
  if (!element) return;
  element.textContent = text || "";
  enhanceReadableText(element, options);
};

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

const BUSINESS_KGI_TYPE = {
  PROJECT_BUILD: "project_build",
  PROJECT_PLUS_REVENUE: "project_plus_revenue",
  REVENUE_SCALE: "revenue_scale"
};

const BUSINESS_KGI_TYPE_LABEL = {
  [BUSINESS_KGI_TYPE.PROJECT_BUILD]: "プロジェクト達成型",
  [BUSINESS_KGI_TYPE.PROJECT_PLUS_REVENUE]: "複合型",
  [BUSINESS_KGI_TYPE.REVENUE_SCALE]: "収益化型"
};

const AI_ASSIST_MODE = "rules-plus-writing";

let db;
const wizardState = {
  step: 1,
  sessionId: null,
  roughInput: null,
  normalizedIntent: null,
  inferredGoal: "",
  businessKgiType: BUSINESS_KGI_TYPE.PROJECT_PLUS_REVENUE,
  businessKgiTypeReason: "",
  ultimateBenefit: "",
  phase1Goal: "",
  phase2Goal: "",
  revenueTarget: "",
  monetizationPath: "",
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
  interviewProcess: {
    initialHypothesis: null,
    missingInfoChecklist: [],
    followUpQuestionLog: [],
    updatedUnderstandingSummary: "",
    feasibilitySnapshot: null,
    proposalRationale: []
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

const resolveUltimateBenefit = (normalized, answers = {}) => {
  const selected = answers.ultimateBenefit || "";
  if (selected) {
    if (/売上|収益/.test(selected)) return "revenue";
    if (/見込み客|問い合わせ|リード|登録/.test(selected)) return "leads";
    if (/影響力|認知/.test(selected)) return "influence";
    if (/時間の自由|脱却|自由/.test(selected)) return "freedom";
  }
  const text = `${normalized.goal} ${normalized.reason} ${normalized.currentState}`.toLowerCase();
  if (/(売上|収益|販売|課金|月.?円|マネタイズ)/i.test(text)) return "revenue";
  if (/(問い合わせ|見込み客|リード|登録|相談)/i.test(text)) return "leads";
  if (/(影響力|認知|フォロワー|発信力|ブランド)/i.test(text)) return "influence";
  if (/(時間の自由|自由な時間|本業依存からの脱却)/i.test(text)) return "freedom";
  return "revenue";
};

const resolveScopeIntent = (normalized, answers = {}) => {
  const selected = answers.scopeIntent || "";
  if (selected) {
    if (/既存|収益化する|改善/.test(selected)) return "existing_revenue";
    if (/初回収益|収益まで/.test(selected)) return "build_and_revenue";
    if (/まず形|土台/.test(selected)) return "build_only";
  }
  const text = `${normalized.goal} ${normalized.reason} ${normalized.currentState}`.toLowerCase();
  if (/(既存|改善|拡大|最適化|テコ入れ|見直し)/i.test(text)) return "existing_revenue";
  if (/(初回売上|初回販売|初回収益|問い合わせ.*件|検証)/i.test(text)) return "build_and_revenue";
  return "build_only";
};

const inferBusinessKgiType = ({ normalized, answers }) => {
  const scopeIntent = resolveScopeIntent(normalized, answers);
  const text = `${normalized.goal} ${normalized.currentState} ${answers.currentAssets || ""}`.toLowerCase();
  const hasExistingAssetSignal = /(すでに|既存|運用中|公開済み|記事\d+|ユーザー\d+|フォロワー\d+)/i.test(text);

  if (scopeIntent === "existing_revenue" || hasExistingAssetSignal) {
    return {
      businessKgiType: BUSINESS_KGI_TYPE.REVENUE_SCALE,
      reason: "既存資産の改善・拡大が中心で、今回の主目的が収益化改善に寄っているため。"
    };
  }
  if (scopeIntent === "build_only") {
    return {
      businessKgiType: BUSINESS_KGI_TYPE.PROJECT_BUILD,
      reason: "今回の期限ではまず土台完成を主目的にしており、収益は次段階として扱うため。"
    };
  }
  return {
    businessKgiType: BUSINESS_KGI_TYPE.PROJECT_PLUS_REVENUE,
    reason: "土台構築と初回収益化を同じ期間で狙う意図が確認できるため。"
  };
};

const resolveRevenueTarget = (answers = {}) => (
  answers.revenueTarget
  || answers.revenueTargetClarification
  || answers.targetOutcomeValue
  || answers.targetOutcomeMetric
  || ""
).trim();

const resolveMonetizationPath = (answers = {}) => (
  answers.monetizationPath
  || answers.monetizationPathClarification
  || answers.monetizationType
  || answers.acquisitionRoute
  || ""
).trim();

const buildBusinessReadiness = ({ normalizedIntent, answers }) => {
  const revenueTarget = resolveRevenueTarget(answers);
  const monetizationPath = resolveMonetizationPath(answers);
  const text = `${normalizedIntent.goal} ${normalizedIntent.reason} ${normalizedIntent.currentState}`.toLowerCase();
  const hasEconomicIntentSignal = /(ブログ|発信|商品|アプリ|サービス|コンテンツ|メディア)/i.test(text);
  const missing = [];
  if (!revenueTarget) missing.push("revenueTarget");
  if (!monetizationPath) missing.push("monetizationPath");
  return { revenueTarget, monetizationPath, hasEconomicIntentSignal, missing };
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
  const baseQuestions = buildQuestionsByBusinessGoalType(analysis.businessGoalType);
  const needDepth = analysis.feasibility.feasibilityLevel !== FEASIBILITY_LEVEL.REALISTIC || analysis.uncertaintyFields.length >= 2;
  const maxQuestions = needDepth ? 6 : 3;
  const selectedQuestions = [];
  const selectedIds = new Set();

  const uncertaintyDrivenQuestionIds = {
    targetAudience: "targetAudience",
    monetizationType: "monetizationType",
    channel: "channel",
    availableTime: "availableTime"
  };

  analysis.uncertaintyFields.forEach((field) => {
    const questionId = uncertaintyDrivenQuestionIds[field];
    const question = baseQuestions.find((item) => item.id === questionId);
    if (question && !selectedIds.has(question.id)) {
      selectedQuestions.push(question);
      selectedIds.add(question.id);
    }
  });

  const highRiskQuestionIds = ["availableTime", "currentAssets", "firstWinDefinition"];
  if (analysis.feasibility.feasibilityLevel === FEASIBILITY_LEVEL.HARD) {
    highRiskQuestionIds.forEach((id) => {
      const question = baseQuestions.find((item) => item.id === id);
      if (question && !selectedIds.has(question.id)) {
        selectedQuestions.push(question);
        selectedIds.add(question.id);
      }
    });
  }

  baseQuestions.forEach((question) => {
    if (selectedQuestions.length >= maxQuestions) return;
    if (selectedIds.has(question.id)) return;
    selectedQuestions.push(question);
    selectedIds.add(question.id);
  });

  return selectedQuestions
    .slice(0, maxQuestions)
    .map((question, index) => ({ ...question, order: index + 1 }));
};

const buildQuestionsByBusinessGoalType = (businessGoalType) => {
  const common = [
    { id: "scopeIntent", text: "今回の期限では、まず何を達成したいですか？（まず形にする / 形にして初回収益まで出す / すでにあるものを収益化する）", axis: "今回の達成範囲" },
    { id: "ultimateBenefit", text: "最終的に一番欲しいベネフィットはどれですか？（売上 / 見込み客 / 問い合わせ / 影響力 / 時間の自由）", axis: "最終ベネフィット" },
    { id: "dreamStatement", text: "本当はどうなりたいですか？（叶えたい夢・理想の状態）", axis: "夢・意味" },
    { id: "trueIntent", text: "この目標を達成すると何が変わりますか？", axis: "夢・意味" },
    { id: "whyNow", text: "なぜ今それをやりたいですか？", axis: "夢・意味" },
    { id: "targetAudience", text: "いちばん届けたい相手は誰ですか？", axis: "対象" },
    { id: "valueOffer", text: "その相手に何を渡せたら価値になりますか？", axis: "価値" },
    { id: "targetOutcomeMetric", text: "最終目標の数字はどれに近いですか？（月売上 / 初回販売件数 / 問い合わせ件数 / アクセス数 / 登録者数）", axis: "最終目標の数字" },
    { id: "targetOutcomeValue", text: "いつまでに、どのくらいを目指しますか？（例: 2026-07-31までに月5万円）", axis: "最終目標の数字" },
    { id: "revenueTarget", text: "今回または次段階で追いたい収益目標は何ですか？（例: 初回販売1件 / 月3万円 / 問い合わせ5件 / 登録20件）", axis: "収益目標" },
    { id: "monetizationPath", text: "どの導線でお金や見込み客につなげますか？（商品販売 / 相談獲得 / 問い合わせ / アフィリエイト / 課金導線）", axis: "収益導線" },
    { id: "progressMetrics", text: "途中の目印はどれに近いですか？（記事数 / 投稿数 / 商品数 / 導線設置数 / 反応件数 / 面談件数）", axis: "途中の判定数字" },
    { id: "progressMetricValue", text: "前進と判断する具体値を教えてください（例: 記事10本、反応10件）", axis: "途中の判定数字" },
    { id: "availableTime", text: "期限までに使える時間はどれくらいですか？", axis: "制約" },
    { id: "currentAssets", text: "今すでにあるもの（経験・実績・素材）は何ですか？", axis: "現在地" },
    { id: "missingAssets", text: "逆に、まだ無いものは何ですか？", axis: "制約" },
    { id: "firstWinDefinition", text: "最初の成功はどの状態なら十分ですか？", axis: "成功定義" }
  ];

  if (businessGoalType === BUSINESS_GOAL_TYPE.AUDIENCE_GROWTH) {
    return [...common, { id: "channel", text: "どの媒体を主軸にしますか？", axis: "手段" }];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.MONETIZATION_VALIDATION) {
    return [...common, { id: "monetizationType", text: "最初の収益は何で作りたいですか？", axis: "手段" }, { id: "trialCount", text: "期限までに何回試せそうですか？", axis: "制約" }];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.OFFER_BUILDING) {
    return [...common, { id: "offerType", text: "何を売る予定ですか？", axis: "提供内容" }, { id: "offerValue", text: "その価値を一言で言うと何ですか？", axis: "価値" }];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.MEDIA_PLATFORM_BUILDING) {
    return [...common, { id: "mediaTheme", text: "どんな情報を届ける媒体ですか？", axis: "提供内容" }, { id: "acquisitionRoute", text: "主な導線は何ですか？", axis: "手段" }, { id: "monetizationType", text: "収益化の方法は何を想定していますか？", axis: "手段" }];
  }
  if (businessGoalType === BUSINESS_GOAL_TYPE.PRODUCT_SERVICE_LAUNCH) {
    return [...common, { id: "productOutline", text: "何を作りたいですか？", axis: "提供内容" }, { id: "earlyUser", text: "最初の利用者は誰ですか？", axis: "対象" }, { id: "launchDoneDefinition", text: "何をもって公開完了としますか？", axis: "成功定義" }];
  }
  return [...common, { id: "currentBottleneck", text: "今いちばん詰まっているのは何ですか？", axis: "現在地" }, { id: "improvementMetric", text: "何を改善できたら前進と言えますか？", axis: "成功定義" }];
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
  const missingInfoChecklist = [
    { id: "trueIntent", label: "本音・目的", isMissing: normalized.reason.length < 8 },
    { id: "targetAudience", label: "対象", isMissing: !/向け|対象|誰/.test(normalized.goal) },
    { id: "valueOffer", label: "提供価値", isMissing: !/何|価値|提供|売る|届け/.test(normalized.goal) },
    { id: "availableTime", label: "使える時間", isMissing: !/週|時間|平日|土日|毎日/.test(normalized.currentState) },
    { id: "currentAssets", label: "現在地", isMissing: normalized.currentState.length < 8 },
    { id: "firstWinDefinition", label: "成功定義", isMissing: !/件|回|人|円|公開|販売|反応/.test(normalized.goal) }
  ];

  const initialHypothesis = {
    trueIntent: normalized.reason || "背景が短く、本音は追加確認が必要",
    target: /向け|対象|誰/.test(normalized.goal) ? "入力から一部推定可能" : "未特定",
    riskPoints: feasibility.feasibilityReasons,
    missingInfo: missingInfoChecklist.filter((item) => item.isMissing).map((item) => item.label)
  };

  return {
    normalizedIntent: normalized,
    businessGoalType,
    businessGoalTypeReason,
    inferredGoal,
    uncertaintyFields,
    feasibility,
    initialHypothesis,
    missingInfoChecklist
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
  renderReadableLongText(questionText, currentQuestion.text, {
    lines: 5,
    formatAsSentenceBlocks: true,
    fallbackCharacterThreshold: 130
  });
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
  const targetAudience = wizardState.answers.targetAudience || wizardState.answers.earlyUser || wizardState.answers.trueIntent || "";
  const channel = wizardState.answers.channel || wizardState.answers.acquisitionRoute || wizardState.answers.mediaTheme || "";
  const monetizationType = wizardState.answers.monetizationType || wizardState.answers.offerType || wizardState.answers.improvementMetric || wizardState.answers.valueOffer || "";
  const availableTime = parseAvailableTimeTag(wizardState.answers.availableTime || wizardState.normalizedIntent?.currentState || "");
  const motivationType = parseMotivationTag(wizardState.answers.whyNow || wizardState.roughInput?.reason || "");

  return {
    targetAudience,
    channel,
    monetizationType,
    availableTime,
    motivationType
  };
};

const buildWizardInsights = () => {
  const dreamStatement = wizardState.answers.dreamStatement || wizardState.answers.trueIntent || wizardState.roughInput?.roughGoal || "";
  const whyNow = wizardState.answers.whyNow || wizardState.roughInput?.reason || "";
  const targetOutcomeMetric = wizardState.answers.targetOutcomeMetric || wizardState.answers.firstWinDefinition || "";
  const targetOutcomeValue = wizardState.answers.targetOutcomeValue || "";
  const progressMetrics = [wizardState.answers.progressMetrics, wizardState.answers.progressMetricValue, wizardState.answers.firstWinDefinition]
    .filter(Boolean)
    .join(" / ");
  const constraintSummary = [
    `使える時間: ${wizardState.answers.availableTime || wizardState.normalizedIntent?.currentState || "未回答"}`,
    `今あるもの: ${wizardState.answers.currentAssets || "未回答"}`,
    `まだ無いもの: ${wizardState.answers.missingAssets || "未回答"}`
  ].join(" | ");
  const aiInterpretedIntent = buildUpdatedUnderstandingSummary();

  let realismAdjustment = "";
  if (wizardState.feasibility?.feasibilityLevel === FEASIBILITY_LEVEL.HARD) {
    realismAdjustment = wizardState.feasibility?.recommendedScopeChange || "期限内で達成可能性を高めるため、初回成果の検証完了を中間ゴールとして設定。";
  }

  return {
    dreamStatement,
    whyNow,
    targetOutcomeMetric: targetOutcomeValue ? `${targetOutcomeMetric}: ${targetOutcomeValue}` : targetOutcomeMetric,
    progressMetrics,
    constraintSummary,
    aiInterpretedIntent,
    realismAdjustment
  };
};

const isLowSignalAnswer = (answer) => {
  if (!answer) return true;
  if (answer.length < 6) return true;
  return /わからない|未定|特に|まだ|とりあえず|なし|ない/.test(answer);
};

const buildAdaptiveFollowUpQuestion = (question, answer) => {
  if (!question || !isLowSignalAnswer(answer) || question.isFollowUp) return null;
  return {
    id: `${question.id}_followup`,
    text: `もう一歩だけ具体化したいです。「${question.text.replace("？", "")}」を決めるために、最小で何なら今週できそうですか？`,
    axis: question.axis || "深掘り",
    isFollowUp: true
  };
};

const buildBusinessClarificationQuestions = (readiness) => {
  const questions = [];
  if (readiness.missing.includes("revenueTarget")) {
    questions.push({
      id: "revenueTargetClarification",
      text: "このアプリはビジネス目標を作る前提です。今回の成果はどれに近いですか？（初回販売 / 月売上 / 問い合わせ / 見込み客 / まず土台完成）",
      axis: "収益目標",
      isFollowUp: true
    });
  }
  if (readiness.missing.includes("monetizationPath")) {
    questions.push({
      id: "monetizationPathClarification",
      text: "どの導線で経済的ベネフィットにつなげますか？（商品販売 / 相談獲得 / 問い合わせ / アフィリエイト / 課金導線）",
      axis: "収益導線",
      isFollowUp: true
    });
  }
  return questions;
};

const buildUpdatedUnderstandingSummary = () => {
  const dream = wizardState.answers.dreamStatement || wizardState.answers.trueIntent || wizardState.roughInput?.roughGoal || "夢は追加調整中";
  const intent = wizardState.answers.whyNow || wizardState.answers.trueIntent || wizardState.roughInput?.reason || "背景は追加調整中";
  const target = wizardState.answers.targetAudience || wizardState.answers.earlyUser || "対象は仮置き";
  const offer = wizardState.answers.valueOffer || wizardState.answers.offerType || wizardState.answers.productOutline || wizardState.inferredGoal;
  const channel = wizardState.answers.channel || wizardState.answers.acquisitionRoute || wizardState.answers.mediaTheme || "導線は仮置き";
  const targetMetric = wizardState.answers.targetOutcomeMetric || "最終目標指標は仮置き";
  const targetMetricValue = wizardState.answers.targetOutcomeValue || "最終目標値は仮置き";
  const progressMetric = wizardState.answers.progressMetrics || wizardState.answers.firstWinDefinition || wizardState.answers.launchDoneDefinition || wizardState.answers.improvementMetric || "途中判定指標は仮置き";
  const progressMetricValue = wizardState.answers.progressMetricValue || "途中判定値は仮置き";
  return `あなたが本当に目指したいこと: 「${dream}」。背景には「${intent}」がある。\n達成を判断する数字: 最終は「${targetMetric} / ${targetMetricValue}」、途中は「${progressMetric} / ${progressMetricValue}」。対象「${target}」へ「${offer}」を「${channel}」で届ける。`;
};

const buildProposalRationale = () => wizardState.proposals.map((proposal) => ({
  candidateType: proposal.candidateType,
  headline: proposal.name,
  reason: proposal.reason,
  concerns: proposal.concerns,
  groundedBy: {
    targetAudience: wizardState.tags.targetAudience || "",
    channel: wizardState.tags.channel || "",
    monetizationType: wizardState.tags.monetizationType || "",
    availableTime: wizardState.answers.availableTime || ""
  }
}));

const formatDeadlineLabel = (deadline) => {
  if (!deadline) return "期限までに";
  const [year, month, day] = String(deadline).split("-");
  if (!year || !month || !day) return `${deadline}までに`;
  return `${Number(month)}月${Number(day)}日までに`;
};

const buildConcretePlanText = ({ directionId, deadline, audience, channel, monetization, inferredGoal, insights, feasibilityLevel }) => {
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

  const selectedPlan = planByDirection[directionId] || fallback;
  const dreamHeadline = insights?.dreamStatement
    ? `${deadlineLabel}${insights.dreamStatement}を形にする`
    : selectedPlan.title;
  const metricCondition = [
    `最終目標: ${insights?.targetOutcomeMetric || "目標指標を設定"}`,
    `途中判定: ${insights?.progressMetrics || "途中指標を設定"}`,
    `前進条件: ${wizardState.answers.firstWinDefinition || wizardState.answers.progressMetricValue || "初回成果の確認"}`
  ].join(" / ");
  const realismNote = feasibilityLevel === FEASIBILITY_LEVEL.HARD
    ? `現実調整: ${insights?.realismAdjustment || "目標を一段手前に落として検証完了を優先"}。`
    : "";
  return {
    title: dreamHeadline,
    goalText: `${selectedPlan.goalText} 達成条件: ${metricCondition}。${realismNote}`.trim()
  };
};

const buildPhaseGoalsByKgiType = ({ businessKgiType, deadline, audience, channel, monetizationPath, revenueTarget }) => {
  const d = deadline || "期限まで";
  if (businessKgiType === BUSINESS_KGI_TYPE.PROJECT_BUILD) {
    return {
      phase1Goal: `${d}までに${audience || "対象顧客"}向けの土台（媒体/商品/導線）を完成し、公開できる状態にする。`,
      phase2Goal: `次段階で${monetizationPath || "収益導線"}を使い、${revenueTarget || "初回収益または問い合わせ"}を検証する。`
    };
  }
  if (businessKgiType === BUSINESS_KGI_TYPE.REVENUE_SCALE) {
    return {
      phase1Goal: `${d}までに既存導線を改善し、計測と改善サイクルを回せる状態にする。`,
      phase2Goal: `${monetizationPath || "既存の収益導線"}で${revenueTarget || "売上・問い合わせ増加"}を達成する。`
    };
  }
  return {
    phase1Goal: `${d}までに${audience || "対象顧客"}向けの土台（媒体/商品/導線）を完成する。`,
    phase2Goal: `${monetizationPath || channel || "導線"}で${revenueTarget || "初回販売1件または問い合わせ獲得"}を達成する。`
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
  const insights = buildWizardInsights();
  const readiness = buildBusinessReadiness({ normalizedIntent: wizardState.normalizedIntent, answers: wizardState.answers });
  const { businessKgiType, reason: businessKgiTypeReason } = inferBusinessKgiType({
    normalized: wizardState.normalizedIntent,
    answers: wizardState.answers
  });
  const ultimateBenefit = resolveUltimateBenefit(wizardState.normalizedIntent, wizardState.answers);

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
      inferredGoal,
      insights,
      feasibilityLevel
    });
    const phaseGoals = buildPhaseGoalsByKgiType({
      businessKgiType,
      deadline,
      audience,
      channel,
      monetizationPath: readiness.monetizationPath || monetization,
      revenueTarget: readiness.revenueTarget
    });
    const typeLabel = BUSINESS_KGI_TYPE_LABEL[businessKgiType] || "未分類";
    const typeAwareName = businessKgiType === BUSINESS_KGI_TYPE.PROJECT_BUILD
      ? `${formatDeadlineLabel(deadline)}収益化の土台になる${audience}向けプロジェクトを完成する`
      : businessKgiType === BUSINESS_KGI_TYPE.REVENUE_SCALE
        ? `${formatDeadlineLabel(deadline)}既存プロジェクトの収益化を改善する`
        : `${formatDeadlineLabel(deadline)}${audience}向けプロジェクトを完成し初回収益まで検証する`;
    const typeAwareGoalText = `${phaseGoals.phase1Goal} ${phaseGoals.phase2Goal} 達成条件: ${concretePlan.goalText}`;
    return {
    candidateType: direction.id,
    directionLabel: direction.title,
    businessKgiType,
    businessKgiTypeLabel: typeLabel,
    businessKgiTypeReason,
    ultimateBenefit,
    phase1Goal: phaseGoals.phase1Goal,
    phase2Goal: phaseGoals.phase2Goal,
    revenueTarget: readiness.revenueTarget || "",
    monetizationPath: readiness.monetizationPath || "",
    name: `${typeAwareName}`,
    goalText: typeAwareGoalText,
    narrative: typeAwareName,
    metrics: `${phaseGoals.phase1Goal} / ${phaseGoals.phase2Goal}`,
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
  renderReadableLongText(normalizedSummaryText, summaryText, {
    lines: 5,
    formatAsSentenceBlocks: true,
    fallbackCharacterThreshold: 120
  });

  feasibilityLevelText.textContent = feasibility.feasibilityLevel;
  const reasonText = wizardState.aiWriting.feasibilityReasonText || feasibility.feasibilityReasons.join(" ");
  renderReadableLongText(feasibilityReasonsText, reasonText, {
    lines: 6,
    formatAsBulletSections: true,
    fallbackCharacterThreshold: 120
  });

  const scopeAdjustmentText = wizardState.aiWriting.scopeAdjustmentText || feasibility.recommendedScopeChange;
  if (feasibility.feasibilityLevel === FEASIBILITY_LEVEL.HARD || scopeAdjustmentText) {
    feasibilityAltRouteLabel.classList.remove("hidden");
    feasibilityAltRoute.classList.remove("hidden");
    renderReadableLongText(feasibilityAltRoute, scopeAdjustmentText, {
      lines: 4,
      formatAsSentenceBlocks: true,
      fallbackCharacterThreshold: 100
    });
  } else {
    feasibilityAltRouteLabel.classList.add("hidden");
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
      <p class="proposal-meta"><small><strong>KGIタイプ:</strong> ${proposal.businessKgiTypeLabel || "未設定"}</small></p>
      <p class="proposal-meta"><small><strong>方向タイプ:</strong> ${proposal.directionLabel || "未設定"}</small></p>
      <p class="proposal-meta"><strong>夢の見出し:</strong> ${proposal.narrative || proposal.name}</p>
      <p class="proposal-meta"><strong>達成条件:</strong> ${proposal.metrics || proposal.goalText}</p>
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
  const insights = buildWizardInsights();
  const candidateKgiNarratives = wizardState.proposals.map((proposal) => proposal.narrative || proposal.name);
  const candidateKgiMetrics = wizardState.proposals.map((proposal) => proposal.metrics || proposal.goalText);
  const finalSelectedReason = `${selectedOriginal?.reason || "理由未設定"} / 編集項目: ${editedFields.join(", ") || "なし"}`;

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
        businessKgiType: wizardState.businessKgiType,
        kgiTypeReason: wizardState.businessKgiTypeReason,
        ultimateBenefit: wizardState.ultimateBenefit,
        phase1Goal: wizardState.phase1Goal,
        phase2Goal: wizardState.phase2Goal,
        revenueTarget: wizardState.revenueTarget,
        monetizationPath: wizardState.monetizationPath,
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
        unselectedCandidates: wizardState.proposals.filter((_candidate, index) => index !== wizardState.selectedProposalIndex),
        editedFields,
        finalEdits: {
          before: selectedOriginal || null,
          after: finalDraft
        },
        proposalRationale: wizardState.interviewProcess.proposalRationale,
        interviewProcess: wizardState.interviewProcess,
        dreamStatement: insights.dreamStatement,
        whyNow: insights.whyNow,
        targetOutcomeMetric: insights.targetOutcomeMetric,
        progressMetrics: insights.progressMetrics,
        constraintSummary: insights.constraintSummary,
        aiInterpretedIntent: insights.aiInterpretedIntent,
        realismAdjustment: insights.realismAdjustment,
        candidateKgiNarratives,
        candidateKgiMetrics,
        finalSelectedReason,
        finalKgi: finalDraft
      }
    };

    const kgiDocRef = await addDoc(collection(db, "kgis"), createdKgi);

    await updateCreationSession({
      status: "completed",
      selectedCandidateIndex: wizardState.selectedProposalIndex,
      editedFields,
      finalKgi: finalDraft,
      dreamStatement: insights.dreamStatement,
      whyNow: insights.whyNow,
      targetOutcomeMetric: insights.targetOutcomeMetric,
      progressMetrics: insights.progressMetrics,
      constraintSummary: insights.constraintSummary,
      aiInterpretedIntent: insights.aiInterpretedIntent,
      realismAdjustment: insights.realismAdjustment,
      candidateKgiNarratives,
      candidateKgiMetrics,
      finalSelectedReason,
      businessKgiType: wizardState.businessKgiType,
      businessKgiTypeReason: wizardState.businessKgiTypeReason,
      ultimateBenefit: wizardState.ultimateBenefit,
      phase1Goal: wizardState.phase1Goal,
      phase2Goal: wizardState.phase2Goal,
      revenueTarget: wizardState.revenueTarget,
      monetizationPath: wizardState.monetizationPath,
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
    initialHypothesis: wizardState.interviewProcess.initialHypothesis,
    missingInfoChecklist: wizardState.interviewProcess.missingInfoChecklist,
    businessGoalType: wizardState.businessGoalType,
    businessGoalTypeReason: wizardState.businessGoalTypeReason,
    businessKgiType: wizardState.businessKgiType,
    businessKgiTypeReason: wizardState.businessKgiTypeReason,
    ultimateBenefit: wizardState.ultimateBenefit,
    phase1Goal: wizardState.phase1Goal,
    phase2Goal: wizardState.phase2Goal,
    revenueTarget: wizardState.revenueTarget,
    monetizationPath: wizardState.monetizationPath,
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
    dreamStatement: "",
    whyNow: "",
    targetOutcomeMetric: "",
    progressMetrics: "",
    constraintSummary: "",
    aiInterpretedIntent: "",
    realismAdjustment: "",
    candidateKgiNarratives: [],
    candidateKgiMetrics: [],
    finalSelectedReason: "",
    interviewProcess: wizardState.interviewProcess,
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
    const initialKgiType = inferBusinessKgiType({ normalized: analysis.normalizedIntent, answers: {} });
    wizardState.businessKgiType = initialKgiType.businessKgiType;
    wizardState.businessKgiTypeReason = initialKgiType.reason;
    wizardState.ultimateBenefit = resolveUltimateBenefit(analysis.normalizedIntent, {});
    wizardState.phase1Goal = "";
    wizardState.phase2Goal = "";
    wizardState.revenueTarget = "";
    wizardState.monetizationPath = "";
    wizardState.questionTemplateType = analysis.businessGoalType;
    wizardState.candidateTemplateType = analysis.businessGoalType;
    wizardState.inferredGoal = analysis.inferredGoal;
    wizardState.uncertaintyFields = analysis.uncertaintyFields;
    wizardState.feasibility = analysis.feasibility;
    wizardState.interviewProcess.initialHypothesis = analysis.initialHypothesis;
    wizardState.interviewProcess.missingInfoChecklist = analysis.missingInfoChecklist;
    wizardState.interviewProcess.feasibilitySnapshot = analysis.feasibility;
    wizardState.questions = buildDynamicQuestions(analysis);
    wizardState.dynamicQuestionsBase = wizardState.questions.map((question) => ({ ...question }));
    wizardState.candidateDirections = buildCandidateDirectionsByBusinessGoalType(
      analysis.businessGoalType,
      analysis.feasibility.feasibilityLevel
    );
    wizardState.askedQuestions = wizardState.questions;
    wizardState.currentQuestionIndex = 0;
    wizardState.answers = {};
    wizardState.interviewProcess.followUpQuestionLog = [];
    wizardState.interviewProcess.updatedUnderstandingSummary = "";
    wizardState.interviewProcess.proposalRationale = [];

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
      candidateDirections: wizardState.candidateDirections,
      initialHypothesis: wizardState.interviewProcess.initialHypothesis,
      missingInfoChecklist: wizardState.interviewProcess.missingInfoChecklist,
      interviewProcess: wizardState.interviewProcess
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
      const followUp = buildAdaptiveFollowUpQuestion(currentQuestion, currentAnswer);
      if (followUp) {
        const nextIndex = wizardState.currentQuestionIndex + 1;
        wizardState.questions.splice(nextIndex, 0, { ...followUp, order: nextIndex + 1 });
        wizardState.questions = wizardState.questions.map((question, index) => ({ ...question, order: index + 1 }));
        wizardState.interviewProcess.followUpQuestionLog.push({
          triggeredBy: currentQuestion.id,
          answer: currentAnswer,
          followUpQuestionId: followUp.id,
          followUpQuestionText: followUp.text
        });
      }
      wizardState.currentQuestionIndex += 1;
      renderQuestion();
      return;
    }

    const readiness = buildBusinessReadiness({
      normalizedIntent: wizardState.normalizedIntent,
      answers: wizardState.answers
    });
    if (readiness.missing.length > 0) {
      const extraQuestions = buildBusinessClarificationQuestions(readiness).filter((question) => !wizardState.questions.some((existing) => existing.id === question.id));
      if (extraQuestions.length > 0) {
        wizardState.questions.push(...extraQuestions.map((question, index) => ({ ...question, order: wizardState.questions.length + index + 1 })));
        wizardState.currentQuestionIndex += 1;
        renderQuestion();
        setStatus("候補作成の前に、収益目標または収益導線をもう少しだけ確認させてください。", false);
        return;
      }
    }

    wizardState.interviewProcess.updatedUnderstandingSummary = buildUpdatedUnderstandingSummary();
    renderReadableLongText(understandingSummaryText, wizardState.interviewProcess.updatedUnderstandingSummary, {
      lines: 6,
      formatAsSentenceBlocks: true,
      fallbackCharacterThreshold: 120
    });
    questionSection.classList.add("hidden");
    proposalSection.classList.remove("hidden");
    understandingCheckSection.classList.remove("hidden");
    proposalList.innerHTML = "";
    setStep(3);
    updateWizardBlockFocus();
    await updateCreationSession({
      status: "understanding_check",
      userAnswers: wizardState.answers,
      interviewProcess: wizardState.interviewProcess
    });
    setStatus("候補作成の前に、AIの理解を確認してください。", false);
    return;
  } finally {
    endInFlight("nextQuestion");
    setButtonBusy(nextQuestionButton, false);
  }
});

const generateProposalsAfterUnderstandingCheck = async () => {
  wizardState.tags = extractTags();
  wizardState.proposals = generateProposals();
  const readiness = buildBusinessReadiness({ normalizedIntent: wizardState.normalizedIntent, answers: wizardState.answers });
  const kgiTypeResult = inferBusinessKgiType({ normalized: wizardState.normalizedIntent, answers: wizardState.answers });
  const phaseGoals = buildPhaseGoalsByKgiType({
    businessKgiType: kgiTypeResult.businessKgiType,
    deadline: wizardState.roughInput.deadline,
    audience: wizardState.tags.targetAudience,
    channel: wizardState.tags.channel,
    monetizationPath: readiness.monetizationPath,
    revenueTarget: readiness.revenueTarget
  });
  wizardState.businessKgiType = kgiTypeResult.businessKgiType;
  wizardState.businessKgiTypeReason = kgiTypeResult.reason;
  wizardState.ultimateBenefit = resolveUltimateBenefit(wizardState.normalizedIntent, wizardState.answers);
  wizardState.phase1Goal = phaseGoals.phase1Goal;
  wizardState.phase2Goal = phaseGoals.phase2Goal;
  wizardState.revenueTarget = readiness.revenueTarget;
  wizardState.monetizationPath = readiness.monetizationPath;
  wizardState.interviewProcess.proposalRationale = buildProposalRationale();
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
  proposalSection.classList.remove("hidden");
  setStep(3);
  updateWizardBlockFocus();
  renderProposals();

  await updateCreationSession({
    status: "proposal_ready",
    tags: wizardState.tags,
    businessKgiType: wizardState.businessKgiType,
    businessKgiTypeReason: wizardState.businessKgiTypeReason,
    ultimateBenefit: wizardState.ultimateBenefit,
    phase1Goal: wizardState.phase1Goal,
    phase2Goal: wizardState.phase2Goal,
    revenueTarget: wizardState.revenueTarget,
    monetizationPath: wizardState.monetizationPath,
    generatedCandidates: wizardState.proposals,
    aiWritingResult: wizardState.aiWriting,
    interviewProcess: wizardState.interviewProcess
  });

  setStatus("KGI候補を作成しました。使いたい案を選んでください。", false);
};

confirmUnderstandingButton.addEventListener("click", async () => {
  if (wizardState.inFlight.confirmUnderstanding) return;
  wizardState.inFlight.confirmUnderstanding = true;
  setButtonBusy(confirmUnderstandingButton, true, "候補作成中...");
  try {
    understandingCheckSection.classList.add("hidden");
    await generateProposalsAfterUnderstandingCheck();
  } finally {
    wizardState.inFlight.confirmUnderstanding = false;
    setButtonBusy(confirmUnderstandingButton, false);
  }
});

reviseUnderstandingButton.addEventListener("click", () => {
  understandingCheckSection.classList.add("hidden");
  questionSection.classList.remove("hidden");
  wizardState.currentQuestionIndex = Math.max(0, wizardState.questions.length - 1);
  renderQuestion();
  setStep(2);
  updateWizardBlockFocus();
  setStatus("回答を調整してください。調整後にもう一度進むと理解確認が更新されます。", false);
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
