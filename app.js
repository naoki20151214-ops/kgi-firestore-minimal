import { collection, addDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const roughGoalInput = document.getElementById("roughGoalInput");
const roughDeadlineInput = document.getElementById("roughDeadlineInput");
const startDeepDiveButton = document.getElementById("startDeepDiveButton");

const questionSection = document.getElementById("questionSection");
const questionProgress = document.getElementById("questionProgress");
const questionText = document.getElementById("questionText");
const questionAnswerInput = document.getElementById("questionAnswerInput");
const prevQuestionButton = document.getElementById("prevQuestionButton");
const nextQuestionButton = document.getElementById("nextQuestionButton");
const questionOptions = document.getElementById("questionOptions");
const otherAnswerField = document.getElementById("otherAnswerField");
const otherAnswerInput = document.getElementById("otherAnswerInput");

const proposalSection = document.getElementById("proposalSection");
const proposalList = document.getElementById("proposalList");
const understandingCheckSection = document.getElementById("understandingCheckSection");
const sourceDataApproveButton = document.getElementById("sourceDataApproveButton");
const sourceDataBackButton = document.getElementById("sourceDataBackButton");
const editSection = document.getElementById("editSection");
const nameInput = document.getElementById("kgiName");
const goalTextInput = document.getElementById("kgiGoalText");
const deadlineInput = document.getElementById("kgiDeadline");
const levelInput = document.getElementById("kgiLevel");
const saveButton = document.getElementById("saveButton");
const statusText = document.getElementById("statusText");
const step1Label = document.getElementById("step1Label");
const step2Label = document.getElementById("step2Label");
const step3Label = document.getElementById("step3Label");
const step4Label = document.getElementById("step4Label");

const wizardState = {
  sessionId: null,
  step: 1,
  upperGoal: "",
  kgiDeadline: "",
  rawSuccessStateInput: "",
  ambiguityPoints: [],
  ambiguityPointsInitial: [],
  ambiguityPointsResolved: [],
  ambiguityPointsRemaining: [],
  followUpQuestions: [],
  followUpQuestionHistory: [],
  currentQuestionIndex: 0,
  followUpAnswers: {},
  followUpAnswerHistory: [],
  followUpStopReason: "",
  maxFollowUpQuestions: 4,
  clarifiedSuccessState: "",
  aiKgiSourceData: null,
  kgiStatement: "",
  kgiSuccessCriteria: [],
  nextKgiSuggestion: "",
  sourceDataConfirmed: false,
  sourceDataEdited: false,
  selectedDraft: null
};

let db;

const FOLLOW_UP_LIBRARY = [
  {
    id: "service_type",
    ambiguityLabel: "副業/サービスの種類",
    text: "何の副業・何のサービスに最も近いですか？",
    options: [
      { id: "blog", label: "ブログ" },
      { id: "sns", label: "SNS発信" },
      { id: "youtube", label: "YouTube" },
      { id: "digital_product", label: "デジタル商品" },
      { id: "consulting", label: "相談/代行" },
      { id: "app_tool", label: "アプリ/ツール" },
      { id: "commerce", label: "物販" },
      { id: "investment", label: "FX/投資" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "domain",
    ambiguityLabel: "ジャンル",
    text: "どのジャンルに最も近いですか？",
    options: [
      { id: "ai", label: "AI" },
      { id: "side_business", label: "副業" },
      { id: "investment", label: "投資" },
      { id: "health", label: "健康" },
      { id: "career", label: "転職" },
      { id: "local", label: "地域情報" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "monetization_path",
    ambiguityLabel: "収益化手段",
    text: "収益は何で発生する想定ですか？",
    options: [
      { id: "affiliate", label: "アフィリエイト" },
      { id: "product_sale", label: "商品販売" },
      { id: "consulting", label: "相談/代行" },
      { id: "ads", label: "広告" },
      { id: "subscription", label: "課金" },
      { id: "undecided", label: "まだ未定" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "publish_level",
    trigger: ["公開", "サイト", "LP", "アプリ", "リリース"],
    ambiguityLabel: "公開の達成レベル",
    text: "「公開」とは、どの状態を達成したら成功ですか？",
    options: [
      { id: "private_url", label: "URLがあり自分だけ見られる状態" },
      { id: "public_url", label: "URLがあり第三者が見られる状態" },
      { id: "domain_public", label: "独自ドメインで第三者が見られる状態" },
      { id: "public_mobile", label: "一般公開され、スマホでも問題なく見られる状態" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "monetization_level",
    trigger: ["収益", "売上", "マネタイズ", "販売", "問い合わせ"],
    ambiguityLabel: "収益化の達成定義",
    text: "「収益化」とは、どの状態を達成したら成功ですか？",
    options: [
      { id: "route_ready", label: "収益導線が入っている状態" },
      { id: "first_click", label: "初回クリックが出た状態" },
      { id: "first_inquiry", label: "初回問い合わせが来た状態" },
      { id: "first_sale", label: "初回販売が出た状態" },
      { id: "monthly_target", label: "月売上目標を達成した状態" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "traffic_level",
    trigger: ["集客", "アクセス", "PV", "流入", "登録者"],
    ambiguityLabel: "集客の達成定義",
    text: "「集客できた」とは、どの状態を達成したら成功ですか？",
    options: [
      { id: "first_user", label: "SNSなどから最低1人来た状態" },
      { id: "daily_one", label: "1日に最低1人来る状態" },
      { id: "monthly_pv", label: "月間PVが一定数ある状態" },
      { id: "organic", label: "検索流入が確認できる状態" },
      { id: "lead", label: "見込み客や登録者が集まった状態" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "beginner_level",
    trigger: ["初心者", "わかりやす", "入門", "初学者"],
    ambiguityLabel: "対象読者レベル",
    text: "「初心者向け」とは、どの程度を想定しますか？",
    options: [
      { id: "no_terms", label: "専門用語なしで読める" },
      { id: "junior_high", label: "中学生でも大枠が分かる" },
      { id: "ai_newbie", label: "AIをほぼ知らない人でも読める" },
      { id: "busy_worker", label: "忙しい社会人がざっくり理解できる" },
      { id: "other", label: "その他" }
    ]
  }
];

const AMBIGUITY_CONFIG = [
  { id: "service_type", label: "副業/サービスの種類", priority: 1, keywords: ["ブログ", "SNS", "YouTube", "商品", "相談", "代行", "アプリ", "ツール", "物販", "投資"] },
  { id: "domain", label: "ジャンル", priority: 2, keywords: ["AI", "副業", "投資", "健康", "転職", "地域"] },
  { id: "monetization_path", label: "収益化手段", priority: 3, keywords: ["収益", "売上", "課金", "アフィリエイト", "広告", "販売"] },
  { id: "publish_level", label: "公開の達成レベル", priority: 4, keywords: ["公開", "サイト", "LP", "アプリ", "リリース"] },
  { id: "minimum_line", label: "最低公開ライン", priority: 5, keywords: ["最低", "必須", "公開ライン", "必要"] },
  { id: "must_vs_ideal", label: "理想条件と必須条件の区別", priority: 6, keywords: ["理想", "できれば", "っぽい", "みたい"] },
  { id: "target_user", label: "誰向けか", priority: 7, keywords: ["向け", "対象", "ユーザー"] },
  { id: "traffic_level", label: "集客の達成定義", priority: 8, keywords: ["集客", "アクセス", "PV", "流入", "登録者"] },
  { id: "monetization_required", label: "収益導線が今回必須か", priority: 9, keywords: ["収益", "売上", "販売", "問い合わせ", "集客"] },
  { id: "beginner_level", label: "対象読者レベル", priority: 10, keywords: ["初心者", "わかりやす", "入門", "初学者"] },
  { id: "ui_completion", label: "UIの完成条件", priority: 10, keywords: ["UI", "デザイン", "見た目", "Yahoo"] }
];

const EXTRA_FOLLOW_UP_LIBRARY = [
  {
    id: "target_user",
    ambiguityLabel: "誰向けか",
    text: "主な対象ユーザーはどれに最も近いですか？",
    options: [
      { id: "beginner_individual", label: "初心者の個人ユーザー" },
      { id: "experienced_individual", label: "経験者の個人ユーザー" },
      { id: "small_business", label: "小規模事業者" },
      { id: "own_use_first", label: "まず自分向け（後で拡張）" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "minimum_line",
    ambiguityLabel: "最低公開ライン",
    text: "最低公開ラインとして、どこまで満たせば「公開してよい」と判断しますか？",
    options: [
      { id: "minimum_one_flow", label: "主要導線が1本動き、最低限の説明コンテンツがある" },
      { id: "minimum_multi_content", label: "主要導線+複数コンテンツ（例: 3本以上）がある" },
      { id: "minimum_quality_check", label: "導線と中身に加え、簡易な品質確認まで完了している" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "must_vs_ideal",
    ambiguityLabel: "理想条件と必須条件の区別",
    text: "理想条件と必須条件の関係は、どれに近いですか？",
    options: [
      { id: "must_only", label: "必須条件を満たせば達成。理想条件は次のKGIで扱う" },
      { id: "must_plus_some_ideal", label: "必須条件+理想条件の一部が必要" },
      { id: "ideal_as_must", label: "理想条件も今回の必須条件として扱う" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "monetization_required",
    ambiguityLabel: "収益導線が今回必須か",
    text: "今回のKGIで、収益導線や売上はどこまで必須にしますか？",
    options: [
      { id: "not_required", label: "今回は必須にしない（公開と価値提供を優先）" },
      { id: "route_required", label: "収益導線の実装までは必須" },
      { id: "first_result_required", label: "初回の問い合わせ/販売など結果発生まで必須" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "ui_completion",
    ambiguityLabel: "UIの完成条件",
    text: "UI・見た目の完成条件は、今回どこまでを必須にしますか？",
    options: [
      { id: "readable_only", label: "情報が読みやすく使える最低限でよい" },
      { id: "brand_consistent", label: "最低限+統一感のある見た目が必要" },
      { id: "high_fidelity", label: "デザイン品質まで高水準で整える必要がある" },
      { id: "other", label: "その他" }
    ]
  }
];

const ALL_FOLLOW_UP_LIBRARY = [...FOLLOW_UP_LIBRARY, ...EXTRA_FOLLOW_UP_LIBRARY];
const FOLLOW_UP_BY_ID = new Map(ALL_FOLLOW_UP_LIBRARY.map((question) => [question.id, question]));
const QUESTION_RULES = {
  service_type: { requiredContext: [], specificityLevel: "specific", priority: 1 },
  domain: { requiredContext: ["service_type"], specificityLevel: "specific", priority: 2 },
  monetization_path: { requiredContext: ["service_type"], specificityLevel: "specific", priority: 3 },
  publish_level: { requiredContext: [], specificityLevel: "specific", priority: 4 },
  minimum_line: { requiredContext: ["service_type"], specificityLevel: "specific", priority: 5 },
  must_vs_ideal: { requiredContext: [], specificityLevel: "specific", priority: 6 },
  target_user: { requiredContext: ["service_type", "domain", "monetization_path"], specificityLevel: "specific", priority: 7 },
  traffic_level: { requiredContext: [], specificityLevel: "specific", priority: 8 },
  monetization_required: { requiredContext: ["monetization_path"], specificityLevel: "specific", priority: 9 },
  beginner_level: { requiredContext: ["target_user"], specificityLevel: "specific", priority: 10 },
  ui_completion: { requiredContext: [], specificityLevel: "specific", priority: 10 }
};
const CONTEXT_BY_QUESTION_ID = {
  service_type: "service_type",
  domain: "domain",
  monetization_path: "monetization_path",
  target_user: "target_user",
  publish_level: "publish_level",
  minimum_line: "minimum_line",
  must_vs_ideal: "must_vs_ideal"
};
const ABSTRACT_TERMS = ["状態", "価値", "達成", "意味", "誰に何を"];

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const setStep = (step) => {
  wizardState.step = step;
  [step1Label, step2Label, step3Label, step4Label].forEach((node, index) => {
    const n = index + 1;
    node.classList.toggle("active", n === step);
    node.classList.toggle("completed", n < step);
  });
};

const pickUpperGoal = (rawText) => {
  const first = (rawText || "").split(/[。\n]/).map((v) => v.trim()).find(Boolean) || "叶えたい未来を言語化中";
  return first;
};

const shouldAsk = (keywords, rawText) => keywords.some((keyword) => rawText.includes(keyword));

const isAudienceClearlyDefined = (text) => /(向け|対象|ペルソナ|初心者|中級者|法人|個人)/.test(text);
const isMinimumLineDefined = (text) => /(最低|少なくとも|必須|本以上|件以上|導線|ページ)/.test(text);
const hasConcreteMetric = (text) => /(\d+|PV|率|売上|件|人|公開|ドメイン)/.test(text);

const deriveAmbiguityPoints = (rawText) => {
  const points = [];
  const contextMissingDefaults = ["service_type", "domain", "monetization_path"];
  AMBIGUITY_CONFIG.forEach((config) => {
    if (contextMissingDefaults.includes(config.id)) {
      points.push(config);
      return;
    }
    const keywordMatched = shouldAsk(config.keywords, rawText);
    if (keywordMatched) {
      points.push(config);
      return;
    }
    if (config.id === "target_user" && !isAudienceClearlyDefined(rawText)) points.push(config);
    if (config.id === "minimum_line" && !isMinimumLineDefined(rawText)) points.push(config);
    if (config.id === "must_vs_ideal" && /(理想|できれば|っぽい|みたい)/.test(rawText)) points.push(config);
    if (config.id === "traffic_level" && !hasConcreteMetric(rawText) && /(集客|アクセス|流入)/.test(rawText)) points.push(config);
  });

  const unique = [];
  const seen = new Set();
  points
    .sort((a, b) => a.priority - b.priority)
    .forEach((point) => {
      if (seen.has(point.id)) return;
      seen.add(point.id);
      unique.push(point);
    });
  return unique;
};

const getResolvedAmbiguityIds = () => {
  const ids = [];
  wizardState.followUpQuestionHistory.forEach((historyItem) => {
    const answer = wizardState.followUpAnswers[historyItem.id];
    if (answer?.selectedOptionId) ids.push(historyItem.id);
  });
  return Array.from(new Set(ids));
};

const getResolvedContext = () => {
  const context = new Set();
  wizardState.followUpQuestionHistory.forEach((historyItem) => {
    const answer = wizardState.followUpAnswers[historyItem.id];
    if (!answer?.selectedOptionId) return;
    const key = CONTEXT_BY_QUESTION_ID[historyItem.id];
    if (key) context.add(key);
  });
  return context;
};

const isAbstractQuestion = (question) => {
  if (!question) return true;
  const questionRule = QUESTION_RULES[question.id];
  if (questionRule?.specificityLevel === "abstract") return true;
  const text = question.text || "";
  return ABSTRACT_TERMS.some((term) => text.includes(term) && !text.includes("どの状態"));
};

const hasRequiredContext = (questionId) => {
  const required = QUESTION_RULES[questionId]?.requiredContext || [];
  const resolvedContext = getResolvedContext();
  return required.every((key) => resolvedContext.has(key));
};

const recomputeAmbiguityState = () => {
  const resolvedIds = getResolvedAmbiguityIds();
  wizardState.ambiguityPointsResolved = wizardState.ambiguityPointsInitial.filter((point) => resolvedIds.includes(point.id));
  wizardState.ambiguityPointsRemaining = wizardState.ambiguityPointsInitial.filter((point) => !resolvedIds.includes(point.id));
  wizardState.ambiguityPoints = wizardState.ambiguityPointsRemaining.map((point) => point.label);
};

const chooseNextQuestion = () => {
  recomputeAmbiguityState();
  const asked = new Set(wizardState.followUpQuestionHistory.map((item) => item.id));
  return wizardState.ambiguityPointsRemaining.find((point) => {
    if (asked.has(point.id) || !FOLLOW_UP_BY_ID.has(point.id)) return false;
    const question = FOLLOW_UP_BY_ID.get(point.id);
    if (isAbstractQuestion(question)) return false;
    return hasRequiredContext(point.id);
  });
};

const canGenerateKgiNow = () => {
  const hasDeadline = Boolean(wizardState.kgiDeadline);
  const hasSuccessState = Boolean(wizardState.rawSuccessStateInput);
  const unresolvedHighPriority = wizardState.ambiguityPointsRemaining.filter((point) => point.priority <= 3).length;
  const answeredCount = getResolvedAmbiguityIds().length;
  return hasDeadline && hasSuccessState && unresolvedHighPriority === 0 && answeredCount >= 2;
};

const isCrossDeadlinePhrase = (raw) => /継続|安定|維持|毎月|ずっと|習慣/.test(raw);

const resolveAnswerLabel = (question, answer) => {
  if (!answer) return "";
  if (answer.selectedOptionId === "other") return answer.otherText || "その他";
  return question.options.find((opt) => opt.id === answer.selectedOptionId)?.label || "";
};

const collectAnswerSummaries = () => wizardState.followUpQuestionHistory.map((historyItem) => {
  const question = FOLLOW_UP_BY_ID.get(historyItem.id);
  if (!question) return null;
  const answer = wizardState.followUpAnswers[question.id];
  if (!answer?.selectedOptionId) return null;
  return {
    id: question.id,
    question: question.text,
    selectedOptionId: answer.selectedOptionId,
    selectedOptionLabel: resolveAnswerLabel(question, answer),
    rawOtherText: answer.selectedOptionId === "other" ? (answer.otherText || "").trim() : ""
  };
}).filter(Boolean);

const findAnswerById = (answers, id) => answers.find((answer) => answer.id === id);

const buildAiKgiSourceData = () => {
  const answers = collectAnswerSummaries();
  const raw = wizardState.rawSuccessStateInput || "";
  const deadline = wizardState.kgiDeadline;
  const targetUserAnswer = findAnswerById(answers, "target_user");
  const serviceTypeAnswer = findAnswerById(answers, "service_type");
  const domainAnswer = findAnswerById(answers, "domain");
  const monetizationPathAnswer = findAnswerById(answers, "monetization_path");
  const publishAnswer = findAnswerById(answers, "publish_level");
  const monetizationAnswer = findAnswerById(answers, "monetization_level");
  const trafficAnswer = findAnswerById(answers, "traffic_level");
  const minimumAnswer = findAnswerById(answers, "minimum_line");
  const mustVsIdealAnswer = findAnswerById(answers, "must_vs_ideal");
  const uiAnswer = findAnswerById(answers, "ui_completion");
  const beginnerAnswer = findAnswerById(answers, "beginner_level");
  const monetizationRequiredAnswer = findAnswerById(answers, "monetization_required");

  const sourceData = {
    upperGoal: wizardState.upperGoal || "叶えたい未来を明確化する",
    currentKgiScope: `${deadline}時点で、今回の挑戦が「達成した」と言える範囲を定義する`,
    kgiDeadline: deadline,
    serviceType: serviceTypeAnswer?.selectedOptionLabel || "サービス種別は追加確認中",
    domain: domainAnswer?.selectedOptionLabel || "ジャンルは追加確認中",
    monetizationPath: monetizationPathAnswer?.selectedOptionLabel || "収益化手段は追加確認中",
    targetUser: targetUserAnswer?.selectedOptionLabel || "対象ユーザーは追加確認中（広すぎない形で絞る）",
    offeringSummary: serviceTypeAnswer?.selectedOptionLabel
      ? `${serviceTypeAnswer.selectedOptionLabel}として利用可能な成果物を公開する`
      : (raw.includes("サイト") ? "利用者が価値を受け取れる形でサイト/コンテンツを提供する" : "対象ユーザーに価値提供できる成果物を提供する"),
    successStateSummary: `${deadline}までに、今回の範囲で「成功した状態」を第三者に説明できる形で成立させる`,
    publicationDefinition: publishAnswer?.selectedOptionLabel || "公開の達成定義は今回の回答範囲で判断",
    monetizationDefinition: monetizationAnswer?.selectedOptionLabel || monetizationRequiredAnswer?.selectedOptionLabel || "収益化は今回の必須条件としては未確定",
    minimumSuccessLine: minimumAnswer?.selectedOptionLabel || "最低ラインは、主要価値が成立し第三者が確認できる公開状態",
    idealSuccessLine: mustVsIdealAnswer?.selectedOptionId === "ideal_as_must"
      ? "理想条件も含めて今回期限で到達する"
      : "必須条件を達成し、理想条件は可能な範囲で先取りする",
    mustHaveConditions: [
      `${deadline}時点で達成状態を説明できること`,
      minimumAnswer?.selectedOptionLabel,
      publishAnswer?.selectedOptionLabel,
      targetUserAnswer?.selectedOptionLabel
    ].filter(Boolean),
    optionalConditions: [
      uiAnswer?.selectedOptionLabel,
      beginnerAnswer?.selectedOptionLabel,
      trafficAnswer?.selectedOptionLabel
    ].filter(Boolean),
    excludedFromCurrentKgi: [
      mustVsIdealAnswer?.selectedOptionId === "must_only" ? "理想条件のフル達成" : "",
      monetizationRequiredAnswer?.selectedOptionId === "not_required" ? "売上/収益の結果発生" : "",
      isCrossDeadlinePhrase(raw) ? "継続運用の安定化（期限後の継続指標）" : ""
    ].filter(Boolean),
    nextKgiSuggestion: isCrossDeadlinePhrase(raw)
      ? "今回達成後は、継続運用と安定流入・収益化を次のKGIとして分離する。"
      : "今回の必須条件達成後、理想条件や中長期成果を次のKGIに切り出す。",
    ambiguityPointsRemaining: wizardState.ambiguityPointsRemaining.map((point) => point.label),
    whyThisStructure: "自由入力はそのまま文面に差し込まず、回答の意味を『必須・任意・今回除外』に分解してKGI生成の元データ化したため。"
  };

  wizardState.aiKgiSourceData = sourceData;
  wizardState.clarifiedSuccessState = `${sourceData.successStateSummary} / 必須条件: ${sourceData.mustHaveConditions.join("、")}`;
  wizardState.nextKgiSuggestion = sourceData.nextKgiSuggestion;
  return sourceData;
};

const buildKgiResultFromSourceData = () => {
  const sourceData = wizardState.aiKgiSourceData;
  if (!sourceData) return;
  const mustConditions = sourceData.mustHaveConditions || [];
  const optionalConditions = sourceData.optionalConditions || [];
  const excluded = sourceData.excludedFromCurrentKgi || [];

  wizardState.kgiStatement = `${sourceData.kgiDeadline}までに、${sourceData.targetUser}に対して${sourceData.offeringSummary}が成立し、今回の成功状態（${sourceData.minimumSuccessLine}）を満たした状態を実現する。`;

  wizardState.kgiSuccessCriteria = Array.from(new Set([
    ...mustConditions.map((item) => `必須: ${item}`),
    ...optionalConditions.map((item) => `任意: ${item}`),
    ...excluded.map((item) => `今回除外: ${item}`)
  ]));
};

const renderQuestion = () => {
  const questionId = wizardState.followUpQuestionHistory[wizardState.currentQuestionIndex]?.id;
  const question = FOLLOW_UP_BY_ID.get(questionId);
  if (!question) return;

  questionProgress.textContent = `質問 ${wizardState.currentQuestionIndex + 1} / 最大${wizardState.maxFollowUpQuestions}`;
  questionText.textContent = question.text;
  questionAnswerInput.value = "";
  questionAnswerInput.classList.add("hidden");

  questionOptions.innerHTML = "";
  const answer = wizardState.followUpAnswers[question.id] || {};
  question.options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "option-row";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `question-${question.id}`;
    input.value = option.id;
    if (answer.selectedOptionId === option.id) input.checked = true;
    input.addEventListener("change", () => {
      wizardState.followUpAnswers[question.id] = {
        selectedOptionId: option.id,
        selectedOptionLabel: option.label,
        otherText: option.id === "other" ? (otherAnswerInput.value || "").trim() : ""
      };
      otherAnswerField.classList.toggle("hidden", option.id !== "other");
      if (option.id !== "other") otherAnswerInput.value = "";
    });
    const span = document.createElement("span");
    span.textContent = option.label;
    label.append(input, span);
    questionOptions.appendChild(label);
  });

  const showOther = answer.selectedOptionId === "other";
  otherAnswerField.classList.toggle("hidden", !showOther);
  otherAnswerInput.value = answer.otherText || "";

  prevQuestionButton.disabled = wizardState.currentQuestionIndex === 0;
  nextQuestionButton.textContent = wizardState.currentQuestionIndex === wizardState.followUpQuestionHistory.length - 1 ? "次へ" : "次の質問へ";
};

const renderProposal = () => {
  const sourceData = wizardState.aiKgiSourceData;
  if (sourceData) {
    understandingCheckSection.classList.remove("hidden");
    const remainingAmbiguity = (sourceData.ambiguityPointsRemaining || []).length > 0
      ? sourceData.ambiguityPointsRemaining.join("、")
      : "特になし";
    understandingCheckSection.innerHTML = `
      <h3>まず確認: KGIを作る元データ</h3>
      <p class="proposal-meta"><strong>あなたが本当に叶えたい未来:</strong> ${sourceData.upperGoal}</p>
      <p class="proposal-meta"><strong>今回の期限で狙う範囲:</strong> ${sourceData.currentKgiScope}</p>
      <p class="proposal-meta"><strong>誰向けに何を提供するか:</strong> ${sourceData.targetUser} / ${sourceData.offeringSummary}</p>
      <p class="proposal-meta"><strong>今回達成とみなす最低ライン:</strong> ${sourceData.minimumSuccessLine}</p>
      <p class="proposal-meta"><strong>今回は入れないもの:</strong> ${(sourceData.excludedFromCurrentKgi || []).join("、") || "特になし"}</p>
      <p class="proposal-meta"><strong>次のKGI候補:</strong> ${sourceData.nextKgiSuggestion}</p>
      <details>
        <summary>補足を見る</summary>
        <p class="proposal-meta"><strong>理想ライン:</strong> ${sourceData.idealSuccessLine}</p>
        <p class="proposal-meta"><strong>曖昧さの残り:</strong> ${remainingAmbiguity}</p>
        <p class="proposal-meta"><strong>この整理にした理由:</strong> ${sourceData.whyThisStructure}</p>
      </details>
    `;
  }

  proposalList.innerHTML = "";
  const card = document.createElement("article");
  card.className = "proposal-card selected";

  const criteriaHtml = wizardState.kgiSuccessCriteria.map((item) => `<li>${item}</li>`).join("");
  const nextKgiHtml = wizardState.nextKgiSuggestion
    ? `<p class="proposal-meta"><strong>次のKGI候補:</strong> ${wizardState.nextKgiSuggestion}</p>`
    : "";

  card.innerHTML = `
    <h3>KGI候補</h3>
    <p class="proposal-meta"><strong>KGI本体:</strong> ${wizardState.kgiStatement}</p>
    <p class="proposal-meta"><strong>KGI達成の判定条件:</strong></p>
    <ul class="proposal-meta">${criteriaHtml}</ul>
    <p class="proposal-meta"><strong>整理した達成状態:</strong> ${wizardState.clarifiedSuccessState}</p>
    ${nextKgiHtml}
  `;

  proposalList.appendChild(card);
  proposalList.classList.toggle("hidden", !wizardState.sourceDataConfirmed);
  sourceDataApproveButton?.classList.toggle("hidden", wizardState.sourceDataConfirmed);
  sourceDataBackButton?.classList.toggle("hidden", wizardState.sourceDataConfirmed);

  const defaultName = `${wizardState.kgiDeadline} KGI`;
  wizardState.selectedDraft = {
    name: defaultName,
    goalText: `${wizardState.kgiStatement}\n\nKGI達成の判定条件:\n- ${wizardState.kgiSuccessCriteria.join("\n- ")}`,
    deadline: wizardState.kgiDeadline,
    level: "easy"
  };

  nameInput.value = wizardState.selectedDraft.name;
  goalTextInput.value = wizardState.selectedDraft.goalText;
  deadlineInput.value = wizardState.selectedDraft.deadline;
  levelInput.value = wizardState.selectedDraft.level;
  editSection.classList.toggle("hidden", !wizardState.sourceDataConfirmed);
};

const ensureCreationSession = async () => {
  if (!db) return false;
  if (wizardState.sessionId) return true;

  const data = {
    flowVersion: "kgi-wizard-v5-essence-first",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    upperGoal: wizardState.upperGoal,
    kgiDeadline: wizardState.kgiDeadline,
    rawSuccessStateInput: wizardState.rawSuccessStateInput,
    clarifiedSuccessState: "",
    aiKgiSourceData: null,
    kgiStatement: "",
    kgiSuccessCriteria: [],
    ambiguityPoints: wizardState.ambiguityPoints,
    ambiguityPointsInitial: wizardState.ambiguityPointsInitial.map((point) => point.label),
    ambiguityPointsResolved: wizardState.ambiguityPointsResolved.map((point) => point.label),
    ambiguityPointsRemaining: wizardState.ambiguityPointsRemaining.map((point) => point.label),
    followUpQuestions: wizardState.followUpQuestionHistory,
    followUpQuestionHistory: wizardState.followUpQuestionHistory,
    followUpAnswers: {},
    followUpAnswerHistory: wizardState.followUpAnswerHistory,
    followUpStopReason: wizardState.followUpStopReason,
    nextKgiSuggestion: "",
    sourceDataConfirmed: wizardState.sourceDataConfirmed,
    sourceDataEdited: wizardState.sourceDataEdited
  };
  const ref = await addDoc(collection(db, "kgiCreationSessions"), data);
  wizardState.sessionId = ref.id;
  return true;
};

const updateCreationSession = async () => {
  if (!wizardState.sessionId || !db) return;
  await updateDoc(doc(db, "kgiCreationSessions", wizardState.sessionId), {
    updatedAt: serverTimestamp(),
    upperGoal: wizardState.upperGoal,
    kgiDeadline: wizardState.kgiDeadline,
    rawSuccessStateInput: wizardState.rawSuccessStateInput,
    clarifiedSuccessState: wizardState.clarifiedSuccessState,
    aiKgiSourceData: wizardState.aiKgiSourceData,
    kgiStatement: wizardState.kgiStatement,
    kgiSuccessCriteria: wizardState.kgiSuccessCriteria,
    ambiguityPoints: wizardState.ambiguityPoints,
    ambiguityPointsInitial: wizardState.ambiguityPointsInitial.map((point) => point.label),
    ambiguityPointsResolved: wizardState.ambiguityPointsResolved.map((point) => point.label),
    ambiguityPointsRemaining: wizardState.ambiguityPointsRemaining.map((point) => point.label),
    followUpQuestions: wizardState.followUpQuestionHistory,
    followUpQuestionHistory: wizardState.followUpQuestionHistory,
    followUpAnswers: wizardState.followUpAnswers,
    followUpAnswerHistory: wizardState.followUpAnswerHistory,
    followUpStopReason: wizardState.followUpStopReason,
    nextKgiSuggestion: wizardState.nextKgiSuggestion,
    sourceDataConfirmed: wizardState.sourceDataConfirmed,
    sourceDataEdited: wizardState.sourceDataEdited
  });
};

startDeepDiveButton.addEventListener("click", async () => {
  const deadline = (roughDeadlineInput.value || "").trim();
  const successState = (roughGoalInput.value || "").trim();

  if (!deadline) {
    alert("1問目: 期限を入力してください。");
    return;
  }
  if (!successState) {
    alert("2問目: 成功状態を入力してください。");
    return;
  }

  wizardState.kgiDeadline = deadline;
  wizardState.rawSuccessStateInput = successState;
  wizardState.upperGoal = pickUpperGoal(successState);
  wizardState.ambiguityPointsInitial = deriveAmbiguityPoints(successState);
  wizardState.ambiguityPointsResolved = [];
  wizardState.ambiguityPointsRemaining = [...wizardState.ambiguityPointsInitial];
  wizardState.ambiguityPoints = wizardState.ambiguityPointsRemaining.map((point) => point.label);
  wizardState.maxFollowUpQuestions = Math.min(6, Math.max(2, wizardState.ambiguityPointsInitial.length));
  wizardState.currentQuestionIndex = 0;
  wizardState.followUpAnswers = {};
  wizardState.followUpQuestionHistory = [];
  wizardState.followUpAnswerHistory = [];
  wizardState.followUpStopReason = "";
  wizardState.sourceDataConfirmed = false;
  wizardState.sourceDataEdited = false;
  wizardState.aiKgiSourceData = null;
  wizardState.kgiStatement = "";
  wizardState.kgiSuccessCriteria = [];

  const firstQuestionPoint = chooseNextQuestion();
  if (firstQuestionPoint) {
    wizardState.followUpQuestionHistory = [{ id: firstQuestionPoint.id, ambiguityLabel: firstQuestionPoint.label }];
  }

  await ensureCreationSession();
  await updateCreationSession();

  if (wizardState.followUpQuestionHistory.length === 0 || canGenerateKgiNow()) {
    wizardState.followUpStopReason = "ambiguity_resolved";
    buildAiKgiSourceData();
    await updateCreationSession();
    proposalSection.classList.remove("hidden");
    questionSection.classList.add("hidden");
    renderProposal();
    setStep(3);
    setStatus("必要な追加質問がなかったため、KGI元データを作成しました。内容を確認してください。", false);
    return;
  }

  questionSection.classList.remove("hidden");
  proposalSection.classList.add("hidden");
  renderQuestion();
  setStep(2);
  setStatus("この目標を達成したと言える条件をそろえるため、必要な質問だけ続けます。", false);
});

prevQuestionButton.addEventListener("click", () => {
  if (wizardState.currentQuestionIndex > 0) {
    wizardState.currentQuestionIndex -= 1;
    renderQuestion();
  }
});

otherAnswerInput.addEventListener("input", () => {
  const questionId = wizardState.followUpQuestionHistory[wizardState.currentQuestionIndex]?.id;
  const question = FOLLOW_UP_BY_ID.get(questionId);
  if (!question) return;
  const answer = wizardState.followUpAnswers[question.id];
  if (answer?.selectedOptionId === "other") {
    answer.otherText = (otherAnswerInput.value || "").trim();
  }
});

nextQuestionButton.addEventListener("click", async () => {
  const questionId = wizardState.followUpQuestionHistory[wizardState.currentQuestionIndex]?.id;
  const question = FOLLOW_UP_BY_ID.get(questionId);
  const answer = wizardState.followUpAnswers[question?.id || ""];
  if (!answer?.selectedOptionId) {
    alert("選択肢を1つ選んでください。");
    return;
  }
  if (answer.selectedOptionId === "other" && !answer.otherText) {
    alert("「その他」の内容を短く入力してください。");
    otherAnswerInput.focus();
    return;
  }

  const existingHistoryIndex = wizardState.followUpAnswerHistory.findIndex((item) => item.questionId === question.id);
  const historyEntry = {
    questionId: question.id,
    questionText: question.text,
    selectedOptionId: answer.selectedOptionId,
    selectedOptionLabel: answer.selectedOptionLabel,
    otherText: answer.otherText || ""
  };
  if (existingHistoryIndex >= 0) wizardState.followUpAnswerHistory[existingHistoryIndex] = historyEntry;
  else wizardState.followUpAnswerHistory.push(historyEntry);

  const isLast = wizardState.currentQuestionIndex === wizardState.followUpQuestionHistory.length - 1;
  if (!isLast) {
    wizardState.currentQuestionIndex += 1;
    renderQuestion();
    return;
  }

  recomputeAmbiguityState();
  const reachedMax = wizardState.followUpAnswerHistory.length >= wizardState.maxFollowUpQuestions;
  const nextPointCandidate = chooseNextQuestion();
  const shouldStop = canGenerateKgiNow() || reachedMax || nextPointCandidate == null;
  if (!shouldStop) {
    const nextPoint = nextPointCandidate;
    wizardState.followUpQuestionHistory.push({ id: nextPoint.id, ambiguityLabel: nextPoint.label });
    wizardState.currentQuestionIndex += 1;
    await updateCreationSession();
    renderQuestion();
    return;
  }

  wizardState.followUpStopReason = reachedMax ? "max_questions_reached" : "ambiguity_resolved";

  buildAiKgiSourceData();
  await updateCreationSession();
  questionSection.classList.add("hidden");
  proposalSection.classList.remove("hidden");
  renderProposal();
  setStep(3);
  setStatus("KGI元データを作成しました。まず内容確認をお願いします。", false);
});

sourceDataApproveButton?.addEventListener("click", async () => {
  if (!wizardState.aiKgiSourceData) {
    setStatus("KGI元データがまだ作成されていません。", true);
    return;
  }
  wizardState.sourceDataConfirmed = true;
  buildKgiResultFromSourceData();
  await updateCreationSession();
  renderProposal();
  setStatus("KGI元データを反映して、KGI本体と達成判定条件を生成しました。", false);
});

sourceDataBackButton?.addEventListener("click", () => {
  wizardState.sourceDataConfirmed = false;
  wizardState.sourceDataEdited = true;
  proposalSection.classList.add("hidden");
  questionSection.classList.remove("hidden");
  wizardState.currentQuestionIndex = Math.max(0, wizardState.followUpQuestionHistory.length - 1);
  renderQuestion();
  setStep(2);
  setStatus("追加質問に戻りました。補足を回答してから再作成できます。", false);
});

const persistKgi = async () => {
  if (!db) {
    alert("Firebase接続を初期化中です。数秒後に再試行してください。");
    return;
  }

  const name = (nameInput.value || "").trim();
  const goalText = (goalTextInput.value || "").trim();
  const deadline = (deadlineInput.value || "").trim();
  const level = (levelInput.value || "normal").trim();

  if (!name || !goalText || !deadline) {
    alert("KGI名・ゴール説明・期限を入力してください。");
    return;
  }
  if (!wizardState.sourceDataConfirmed) {
    alert("先にKGI元データを確認して「だいたい合っている」を押してください。");
    return;
  }

  saveButton.disabled = true;
  setStep(4);
  setStatus("保存中です...");

  try {
    const docRef = await addDoc(collection(db, "kgis"), {
      name,
      goalText,
      startDate: new Date().toISOString().slice(0, 10),
      deadline,
      explanationLevel: level,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      creationFlow: "kgi-wizard-v5-essence-first",
      creationSessionId: wizardState.sessionId,
      sourceMeta: {
        upperGoal: wizardState.upperGoal,
        kgiDeadline: wizardState.kgiDeadline,
        rawSuccessStateInput: wizardState.rawSuccessStateInput,
        clarifiedSuccessState: wizardState.clarifiedSuccessState,
        aiKgiSourceData: wizardState.aiKgiSourceData,
        kgiStatement: wizardState.kgiStatement,
        kgiSuccessCriteria: wizardState.kgiSuccessCriteria,
        ambiguityPoints: wizardState.ambiguityPoints,
        ambiguityPointsInitial: wizardState.ambiguityPointsInitial.map((point) => point.label),
        ambiguityPointsResolved: wizardState.ambiguityPointsResolved.map((point) => point.label),
        ambiguityPointsRemaining: wizardState.ambiguityPointsRemaining.map((point) => point.label),
        followUpQuestions: wizardState.followUpQuestionHistory,
        followUpQuestionHistory: wizardState.followUpQuestionHistory,
        followUpAnswers: wizardState.followUpAnswers,
        followUpAnswerHistory: wizardState.followUpAnswerHistory,
        followUpStopReason: wizardState.followUpStopReason,
        nextKgiSuggestion: wizardState.nextKgiSuggestion,
        sourceDataConfirmed: wizardState.sourceDataConfirmed,
        sourceDataEdited: wizardState.sourceDataEdited
      }
    });

    await updateCreationSession();
    setStatus("保存が完了しました。詳細画面へ移動します。", false);
    location.href = `./detail.html?id=${docRef.id}`;
  } catch (error) {
    console.error(error);
    setStatus("保存に失敗しました。Firebase設定とルールを確認してください。", true);
    saveButton.disabled = false;
  }
};

saveButton.addEventListener("click", persistKgi);

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
