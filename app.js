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
  followUpQuestions: [],
  currentQuestionIndex: 0,
  followUpAnswers: {},
  clarifiedSuccessState: "",
  kgiStatement: "",
  kgiSuccessCriteria: [],
  nextKgiSuggestion: "",
  selectedDraft: null
};

let db;

const FOLLOW_UP_LIBRARY = [
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

const shouldAsk = (question, rawText) => question.trigger.some((keyword) => rawText.includes(keyword));

const buildFollowUpQuestions = (rawText) => {
  const matched = FOLLOW_UP_LIBRARY.filter((q) => shouldAsk(q, rawText));
  return matched.slice(0, 4);
};

const isCrossDeadlinePhrase = (raw) => /継続|安定|維持|毎月|ずっと|習慣/.test(raw);

const resolveAnswerLabel = (question, answer) => {
  if (!answer) return "";
  if (answer.selectedOptionId === "other") return answer.otherText || "その他";
  return question.options.find((opt) => opt.id === answer.selectedOptionId)?.label || "";
};

const buildKgiResult = () => {
  const deadline = wizardState.kgiDeadline;
  const answers = wizardState.followUpQuestions.map((question) => ({
    id: question.id,
    question: question.text,
    value: resolveAnswerLabel(question, wizardState.followUpAnswers[question.id])
  })).filter((v) => v.value);

  const clarifiedParts = [wizardState.rawSuccessStateInput, ...answers.map((a) => `${a.question} → ${a.value}`)];
  wizardState.clarifiedSuccessState = clarifiedParts.join(" / ");

  const statementAddOn = answers.length > 0 ? `（達成定義: ${answers.map((a) => a.value).join("、")}）` : "";
  wizardState.kgiStatement = `${deadline}までに、${wizardState.rawSuccessStateInput}${statementAddOn}を達成する。`;

  const baseCriteria = [
    `${deadline}時点で「${wizardState.rawSuccessStateInput}」が第三者にも説明できる形で成立している`,
    ...answers.map((a) => a.value)
  ];
  wizardState.kgiSuccessCriteria = Array.from(new Set(baseCriteria));

  if (isCrossDeadlinePhrase(wizardState.rawSuccessStateInput)) {
    wizardState.nextKgiSuggestion = "今回のKGI達成後に、継続運用の安定化（流入維持・収益安定）を次のKGIとして分けるのがおすすめです。";
  } else {
    wizardState.nextKgiSuggestion = "";
  }
};

const renderQuestion = () => {
  const question = wizardState.followUpQuestions[wizardState.currentQuestionIndex];
  if (!question) return;

  questionProgress.textContent = `質問 ${wizardState.currentQuestionIndex + 1} / ${wizardState.followUpQuestions.length}`;
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
  nextQuestionButton.textContent = wizardState.currentQuestionIndex === wizardState.followUpQuestions.length - 1 ? "KGIを作成する" : "次へ";
};

const renderProposal = () => {
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
  editSection.classList.remove("hidden");
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
    kgiStatement: "",
    kgiSuccessCriteria: [],
    ambiguityPoints: wizardState.ambiguityPoints,
    followUpQuestions: wizardState.followUpQuestions,
    followUpAnswers: {},
    nextKgiSuggestion: ""
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
    kgiStatement: wizardState.kgiStatement,
    kgiSuccessCriteria: wizardState.kgiSuccessCriteria,
    ambiguityPoints: wizardState.ambiguityPoints,
    followUpQuestions: wizardState.followUpQuestions,
    followUpAnswers: wizardState.followUpAnswers,
    nextKgiSuggestion: wizardState.nextKgiSuggestion
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
  wizardState.followUpQuestions = buildFollowUpQuestions(successState);
  wizardState.ambiguityPoints = wizardState.followUpQuestions.map((q) => q.ambiguityLabel);
  wizardState.currentQuestionIndex = 0;
  wizardState.followUpAnswers = {};

  await ensureCreationSession();
  await updateCreationSession();

  if (wizardState.followUpQuestions.length === 0) {
    buildKgiResult();
    await updateCreationSession();
    proposalSection.classList.remove("hidden");
    questionSection.classList.add("hidden");
    renderProposal();
    setStep(3);
    setStatus("追加質問なしでKGIを作成しました。", false);
    return;
  }

  questionSection.classList.remove("hidden");
  proposalSection.classList.add("hidden");
  renderQuestion();
  setStep(2);
  setStatus("達成状態の解釈ズレを減らすために、追加質問に答えてください。", false);
});

prevQuestionButton.addEventListener("click", () => {
  if (wizardState.currentQuestionIndex > 0) {
    wizardState.currentQuestionIndex -= 1;
    renderQuestion();
  }
});

otherAnswerInput.addEventListener("input", () => {
  const question = wizardState.followUpQuestions[wizardState.currentQuestionIndex];
  if (!question) return;
  const answer = wizardState.followUpAnswers[question.id];
  if (answer?.selectedOptionId === "other") {
    answer.otherText = (otherAnswerInput.value || "").trim();
  }
});

nextQuestionButton.addEventListener("click", async () => {
  const question = wizardState.followUpQuestions[wizardState.currentQuestionIndex];
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

  const isLast = wizardState.currentQuestionIndex === wizardState.followUpQuestions.length - 1;
  if (!isLast) {
    wizardState.currentQuestionIndex += 1;
    renderQuestion();
    return;
  }

  buildKgiResult();
  await updateCreationSession();
  questionSection.classList.add("hidden");
  proposalSection.classList.remove("hidden");
  renderProposal();
  setStep(3);
  setStatus("KGI本体とKGI達成の判定条件を作成しました。", false);
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
        kgiStatement: wizardState.kgiStatement,
        kgiSuccessCriteria: wizardState.kgiSuccessCriteria,
        ambiguityPoints: wizardState.ambiguityPoints,
        followUpQuestions: wizardState.followUpQuestions,
        followUpAnswers: wizardState.followUpAnswers,
        nextKgiSuggestion: wizardState.nextKgiSuggestion
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
