import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";
import { decideNowAction } from "./now-action-engine.js";

const params = new URLSearchParams(window.location.search);
const kgiId = params.get("id")?.trim() ?? "";
const phaseId = params.get("phaseId")?.trim() ?? "";
const kpiId = params.get("kpiId")?.trim() ?? "";

const backToPhaseLink = document.getElementById("backToPhaseLink");
const kpiTitle = document.getElementById("kpiTitle");
const kpiStatus = document.getElementById("kpiStatus");
const kpiMeta = document.getElementById("kpiMeta");
const kpiName = document.getElementById("kpiName");
const kpiDescription = document.getElementById("kpiDescription");
const kpiType = document.getElementById("kpiType");
const kpiTargetValue = document.getElementById("kpiTargetValue");
const kpiProgress = document.getElementById("kpiProgress");
const kpiDocStatus = document.getElementById("kpiDocStatus");
const phasePlanningStatusMessage = document.getElementById("phasePlanningStatusMessage");
const kpiDesignStateBadge = document.getElementById("kpiDesignStateBadge");
const kpiExecutionStateBadge = document.getElementById("kpiExecutionStateBadge");
const taskTitleInput = document.getElementById("taskTitleInput");
const taskDescriptionInput = document.getElementById("taskDescriptionInput");
const createTaskButton = document.getElementById("createTaskButton");
const taskCreateStatus = document.getElementById("taskCreateStatus");
const generateAiTaskButton = document.getElementById("generateAiTaskButton");
const aiTaskAvailabilityStatus = document.getElementById("aiTaskAvailabilityStatus");
const aiTaskGenerateStatus = document.getElementById("aiTaskGenerateStatus");
const aiTaskCandidateList = document.getElementById("aiTaskCandidateList");
const taskStatus = document.getElementById("taskStatus");
const taskList = document.getElementById("taskList");

let db;
let currentKpi = null;
let currentKgi = null;
let allKpisForKgi = [];
let currentTargetPhase = null;
let currentPhasePlanningStatus = "draft";
let currentTasksForKpi = [];
let aiTaskCandidates = [];
const AI_TASK_CANDIDATE_COUNT = 3;
const MAX_ACTIVE_TASKS_FOR_AI_GENERATION = 3;
const MAX_SAVED_AI_TASKS_PER_KPI = 20;
const japaneseTextPattern = /[ぁ-んァ-ヶ一-龠々ー]/;
const tasksDebugState = {
  lastQueryConditions: null,
  errorCode: "",
  errorMessage: ""
};
const PHASE_PLANNING_STATUS_VALUES = new Set(["draft", "cleanup_needed", "finalized"]);

const asText = (value, fallback = "-") => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const toDateText = (timestamp) => {
  if (timestamp && typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleString("ja-JP");
  }
  return "-";
};

const createDecomposePrompt = (task) => {
  const contextLines = [];
  if (asText(currentKgi?.kgiName, "") !== "") {
    contextLines.push(`- KGI: ${asText(currentKgi?.kgiName, "")}`);
  }
  if (asText(currentTargetPhase?.name, "") !== "") {
    contextLines.push(`- フェーズ: ${asText(currentTargetPhase?.name, "")}`);
  }
  if (asText(currentKpi?.name, "") !== "") {
    contextLines.push(`- KPI: ${asText(currentKpi?.name, "")}`);
  }
  contextLines.push(`- タスク名: ${asText(task?.title, "名称未設定タスク")}`);
  contextLines.push(`- タスク説明: ${asText(task?.description, "（説明なし）")}`);

  return `以下のタスクを、初心者でも実行できるレベルまでやさしく分解してください。

私は初心者です。
専門用語はなるべくやさしい言葉に言い換えてください。
できれば、開く画面名、入力例、完成した状態の例も入れてください。
1ステップごとに、何をすればいいか分かるようにしてください。
抽象的なアドバイスではなく、今すぐ動ける具体的な手順にしてください。

条件:
- 5〜10個の具体的な手順に分ける
- 一番最初にやることを最初に書く
- 1ステップごとに「何をするか」が分かるようにする
- 必要なら入力例や完成例も入れる
- つまずきやすい点も書く

前提情報:
${contextLines.join("\n")}

出力形式:
1. 最初にやること
2. 手順一覧
3. 完成した状態の例
4. つまずきやすい点
5. 次にやるとよいこと`;
};

const formatTaskStatus = (task) => {
  if (task.isCompleted) {
    return "完了";
  }
  const statusValue = asText(task.status, "active");
  if (statusValue === "active") {
    return "進行中";
  }
  if (statusValue === "completed") {
    return "完了";
  }
  return statusValue;
};

const getPlanningStatusLabel = (status) => {
  if (status === "finalized") {
    return "finalized（確定）";
  }
  if (status === "cleanup_needed") {
    return "cleanup_needed（整理中）";
  }
  return "draft（設計中）";
};

const getAiTaskGenerationGate = () => {
  const planningStatus = PHASE_PLANNING_STATUS_VALUES.has(currentPhasePlanningStatus)
    ? currentPhasePlanningStatus
    : "draft";
  if (planningStatus !== "finalized") {
    return { isAllowed: false, reason: "このフェーズのKPIはまだ整理中です。整理完了後にタスク生成できます。" };
  }

  return { isAllowed: true, reason: "KPIが確定済みのため、AIタスク生成を実行できます。" };
};

const updateAiTaskGenerationUi = () => {
  const gate = getAiTaskGenerationGate();
  generateAiTaskButton.disabled = !gate.isAllowed;
  createTaskButton.disabled = !gate.isAllowed;
  aiTaskAvailabilityStatus.textContent = gate.reason;
  aiTaskAvailabilityStatus.classList.toggle("warning", !gate.isAllowed);
  kpiExecutionStateBadge.textContent = gate.isAllowed ? "実行可能" : "実行保留";
  kpiExecutionStateBadge.className = `badge ${gate.isAllowed ? "ready" : "design"}`;
};

const renderKpiPlanningBadges = () => {
  const planningStatus = PHASE_PLANNING_STATUS_VALUES.has(currentPhasePlanningStatus)
    ? currentPhasePlanningStatus
    : "draft";
  const isFinalized = planningStatus === "finalized";
  kpiDesignStateBadge.textContent = isFinalized ? "設計完了" : "設計中";
  kpiDesignStateBadge.className = `badge ${isFinalized ? "ready" : "design"}`;
  phasePlanningStatusMessage.textContent = `フェーズKPI状態: ${getPlanningStatusLabel(planningStatus)}`;
};

const renderTasks = (tasks) => {
  if (!tasks.length) {
    taskStatus.textContent = "タスクはまだありません。上のフォームから追加してください。";
    taskList.hidden = true;
    taskList.innerHTML = "";
    return;
  }

  taskList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  tasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = "task-item";

    const title = document.createElement("h3");
    title.textContent = asText(task.title, "名称未設定タスク");

    const description = document.createElement("p");
    description.textContent = asText(task.description, "説明は未設定です。");

    const meta = document.createElement("p");
    meta.className = "task-meta";
    meta.textContent = `status: ${formatTaskStatus(task)} / 作成: ${toDateText(task.createdAt)} / 更新: ${toDateText(task.updatedAt)}`;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const decomposeButton = document.createElement("button");
    decomposeButton.type = "button";
    decomposeButton.className = "secondary";
    decomposeButton.textContent = "AIでやさしく分解";
    actions.appendChild(decomposeButton);

    if (!task.isCompleted) {
      const completeButton = document.createElement("button");
      completeButton.type = "button";
      completeButton.className = "secondary";
      completeButton.textContent = "完了にする";
      completeButton.addEventListener("click", () => {
        void completeTask(task.id, completeButton);
      });
      actions.appendChild(completeButton);
    }

    const decomposePanel = document.createElement("div");
    decomposePanel.className = "task-decompose-panel";
    decomposePanel.hidden = true;

    const promptLabel = document.createElement("p");
    promptLabel.className = "task-decompose-label";
    promptLabel.textContent = "AIに貼る用プロンプト";

    const promptTextarea = document.createElement("textarea");
    promptTextarea.className = "task-decompose-textarea";
    promptTextarea.readOnly = true;

    const decomposeActions = document.createElement("div");
    decomposeActions.className = "task-decompose-actions";

    const copyPromptButton = document.createElement("button");
    copyPromptButton.type = "button";
    copyPromptButton.className = "secondary";
    copyPromptButton.textContent = "コピー";

    const copyStatus = document.createElement("p");
    copyStatus.className = "task-copy-status";
    copyStatus.setAttribute("aria-live", "polite");

    decomposeButton.addEventListener("click", () => {
      const willOpen = decomposePanel.hidden;
      if (willOpen) {
        promptTextarea.value = createDecomposePrompt(task);
      }
      decomposePanel.hidden = !willOpen;
      decomposeButton.textContent = willOpen ? "分解プロンプトを閉じる" : "AIでやさしく分解";
      if (willOpen) {
        copyStatus.textContent = "";
      }
    });

    copyPromptButton.addEventListener("click", async () => {
      const promptText = promptTextarea.value.trim();
      if (!promptText) {
        return;
      }
      try {
        await navigator.clipboard.writeText(promptText);
        copyStatus.textContent = "プロンプトをコピーしました";
      } catch (error) {
        console.error(error);
        copyStatus.textContent = "コピーに失敗しました。手動でコピーしてください。";
      }
    });

    decomposeActions.append(copyPromptButton, copyStatus);
    decomposePanel.append(promptLabel, promptTextarea, decomposeActions);

    item.append(title, description, meta, actions, decomposePanel);
    fragment.appendChild(item);
  });

  taskList.appendChild(fragment);
  taskList.hidden = false;
  taskStatus.textContent = `${tasks.length}件のタスクを表示しています。`;
};

const formatErrorDetail = (error) => {
  const code = typeof error?.code === "string" ? error.code : "UNKNOWN_ERROR";
  const message = typeof error?.message === "string" ? error.message : String(error);
  return { code, message };
};

const loadKpi = async () => {
  const kpiSnapshot = await getDoc(doc(db, "kpis", kpiId));
  if (!kpiSnapshot.exists()) {
    throw new Error("KPI_NOT_FOUND");
  }

  const data = kpiSnapshot.data();
  currentKpi = { id: kpiSnapshot.id, ...data };
  const displayKpiName = asText(data?.name, "名称未設定KPI");
  kpiTitle.textContent = displayKpiName;
  kpiName.textContent = displayKpiName;
  kpiDescription.textContent = asText(data?.description, "説明は未設定です。");
  kpiType.textContent = asText(data?.type, "action");
  kpiTargetValue.textContent = Number.isFinite(Number(data?.targetValue)) ? String(Number(data.targetValue)) : "-";
  const progressRaw = Number(data?.progress ?? data?.overallProgress ?? 0);
  const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, progressRaw)) : 0;
  kpiProgress.textContent = `${Math.round(progress)}%`;
  kpiDocStatus.textContent = asText(data?.status, "active");
  renderKpiPlanningBadges();
  updateAiTaskGenerationUi();
  kpiMeta.hidden = false;
  kpiStatus.textContent = "";
};

const loadTasks = async () => {
  tasksDebugState.lastQueryConditions = { kpiId, kgiId, phaseId };
  tasksDebugState.errorCode = "";
  tasksDebugState.errorMessage = "";
  console.info("[KPI tasks query] where conditions", tasksDebugState.lastQueryConditions);

  try {
    const taskQuery = query(collection(db, "tasks"), where("kpiId", "==", kpiId));
    const taskSnapshot = await getDocs(taskQuery);
    const tasks = taskSnapshot.docs
      .map((taskDoc) => ({ id: taskDoc.id, ...taskDoc.data() }))
      .sort((a, b) => {
        const aTime = a?.createdAt && typeof a.createdAt.toMillis === "function" ? a.createdAt.toMillis() : 0;
        const bTime = b?.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      });
    currentTasksForKpi = tasks;
    renderTasks(tasks);
    const kpiAction = decideNowAction({
      kgis: [{ id: kgiId }],
      phases: [{ id: phaseId, kgiId, kpiPlanningStatus: currentPhasePlanningStatus }],
      kpis: [{ id: kpiId, kgiId, phaseId, status: asText(currentKpi?.status, "draft") }],
      tasks: tasks.map((task) => ({ ...task, kpiId })),
      scope: "kpi",
      kpiId
    });
    const actionSummary = kpiAction ? ` / 今やること: ${kpiAction.title}` : "";
    taskStatus.textContent = `${tasks.length}件のタスクを表示しています。${actionSummary} (query: kpiId=${asText(kpiId, "undefined")})`;
  } catch (error) {
    const { code, message } = formatErrorDetail(error);
    tasksDebugState.errorCode = code;
    tasksDebugState.errorMessage = message;
    console.error("[KPI tasks query failed]", {
      code,
      message,
      conditions: tasksDebugState.lastQueryConditions
    });
    taskList.hidden = true;
    taskList.innerHTML = "";
    const isIndexError = code.includes("failed-precondition") || message.includes("requires an index");
    taskStatus.textContent = isIndexError
      ? "タスク取得クエリがインデックス不足で失敗しました。クエリ条件を簡素化して再試行してください。"
      : `タスクの読み込みに失敗しました。 code=${code} / message=${message} / query={kpiId:${asText(
          kpiId,
          "undefined"
        )},kgiId:${asText(kgiId, "undefined")},phaseId:${asText(phaseId, "undefined")}}`;
  }
};

const normalizeRoadmapPhase = (phase, index = 0) => {
  const phaseNumber = Number.isFinite(Number(phase?.phaseNumber)) ? Number(phase.phaseNumber) : index + 1;
  return {
    id: asText(phase?.id, `phase_${phaseNumber}`),
    name: asText(phase?.title ?? phase?.name, `フェーズ${phaseNumber}`),
    purpose: asText(phase?.description ?? phase?.goal ?? phase?.summary, "説明は未設定です。"),
    deadline: asText(phase?.deadline ?? phase?.targetDate ?? phase?.dueDate, ""),
    kpiPlanningStatus: asText(phase?.kpiPlanningStatus, "draft"),
    phaseNumber
  };
};

const toPlainTask = (task) => ({
  id: asText(task?.id, ""),
  title: asText(task?.title, ""),
  description: asText(task?.description, ""),
  status: asText(task?.status, ""),
  isCompleted: Boolean(task?.isCompleted)
});

const TASK_STOPWORDS = new Set([
  "する", "した", "して", "します", "できる", "ため", "こと", "もの", "よう", "まず", "今回", "について",
  "作成", "作る", "書く", "記入", "入力", "追加", "確認", "実施", "対応", "設定", "作業", "タスク"
]);
const TASK_VERB_SYNONYMS = {
  作成: "作る",
  作る: "作る",
  書く: "書く",
  記入: "書く",
  入力: "書く",
  定義: "決める",
  決定: "決める",
  決める: "決める",
  確認: "確認",
  チェック: "確認"
};

const normalizeTaskText = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[0-9]+/g, "#")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenizeTaskText = (value) => {
  const normalized = normalizeTaskText(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(" ")
    .map((token) => TASK_VERB_SYNONYMS[token] ?? token)
    .filter((token) => token.length >= 2 && !TASK_STOPWORDS.has(token));
};

const calcTokenOverlap = (leftTokens, rightTokens) => {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  if (!left.size || !right.size) {
    return 0;
  }
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) {
      intersection += 1;
    }
  });
  return intersection / Math.max(left.size, right.size);
};

const isSimilarTask = (taskA, taskB) => {
  const titleA = normalizeTaskText(taskA?.title);
  const titleB = normalizeTaskText(taskB?.title);
  const combinedA = normalizeTaskText(`${asText(taskA?.title, "")} ${asText(taskA?.description, "")}`);
  const combinedB = normalizeTaskText(`${asText(taskB?.title, "")} ${asText(taskB?.description, "")}`);
  if (!combinedA || !combinedB) {
    return false;
  }
  if (titleA === titleB || combinedA === combinedB) {
    return true;
  }
  if (combinedA.includes(titleB) || combinedB.includes(titleA)) {
    return true;
  }
  const titleOverlap = calcTokenOverlap(tokenizeTaskText(taskA?.title), tokenizeTaskText(taskB?.title));
  if (titleOverlap >= 0.8) {
    return true;
  }
  const combinedOverlap = calcTokenOverlap(
    tokenizeTaskText(`${asText(taskA?.title, "")} ${asText(taskA?.description, "")}`),
    tokenizeTaskText(`${asText(taskB?.title, "")} ${asText(taskB?.description, "")}`)
  );
  return combinedOverlap >= 0.72;
};

const filterDuplicateCandidates = (candidates, existingTasks) => {
  const unique = [];
  candidates.forEach((candidate) => {
    if (existingTasks.some((task) => isSimilarTask(candidate, task))) {
      return;
    }
    if (unique.some((task) => isSimilarTask(candidate, task))) {
      return;
    }
    unique.push(candidate);
  });
  return unique;
};

const countActiveTasks = (tasks) => tasks
  .filter((task) => {
    const status = asText(task?.status, "active").toLowerCase();
    return !Boolean(task?.isCompleted) && status === "active";
  })
  .length;

const renderAiTaskCandidates = () => {
  if (!aiTaskCandidates.length) {
    aiTaskCandidateList.hidden = true;
    aiTaskCandidateList.innerHTML = "";
    return;
  }

  aiTaskCandidateList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  aiTaskCandidates.forEach((candidate, index) => {
    const item = document.createElement("li");
    item.className = "task-item ai-candidate";
    const title = document.createElement("h3");
    title.textContent = asText(candidate?.title, `AIタスク候補 ${index + 1}`);
    const description = document.createElement("p");
    description.textContent = asText(candidate?.description, "説明は未設定です。");
    const meta = document.createElement("p");
    meta.className = "task-meta";
    meta.textContent = `stage: ${asText(candidate?.stage, "build")} / priority: ${Number.isFinite(Number(candidate?.priority)) ? String(candidate.priority) : "-"}`;

    const actions = document.createElement("div");
    actions.className = "task-actions";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "このタスクを採用";
    saveButton.addEventListener("click", () => {
      void saveAiTaskCandidate(index, saveButton);
    });
    actions.appendChild(saveButton);
    const note = document.createElement("p");
    note.className = "candidate-note";
    note.textContent = "※ AI候補（未保存）";
    item.append(title, description, meta, note, actions);
    fragment.appendChild(item);
  });

  aiTaskCandidateList.appendChild(fragment);
  aiTaskCandidateList.hidden = false;
};

const loadKgiContext = async () => {
  const kgiSnapshot = await getDoc(doc(db, "kgis", kgiId));
  if (!kgiSnapshot.exists()) {
    throw new Error("KGI_NOT_FOUND");
  }
  const kgiData = kgiSnapshot.data();
  const roadmapPhases = Array.isArray(kgiData?.roadmapPhases) ? kgiData.roadmapPhases : [];
  const normalizedRoadmapPhases = roadmapPhases.map((phase, index) => normalizeRoadmapPhase(phase, index));
  currentTargetPhase = normalizedRoadmapPhases.find((phase) => phase.id === phaseId) ?? null;
  currentPhasePlanningStatus = PHASE_PLANNING_STATUS_VALUES.has(asText(currentTargetPhase?.kpiPlanningStatus, "draft"))
    ? asText(currentTargetPhase?.kpiPlanningStatus, "draft")
    : "draft";

  const kpiSnapshot = await getDocs(query(collection(db, "kpis"), where("kgiId", "==", kgiId)));
  allKpisForKgi = kpiSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      phaseId: asText(data?.phaseId, ""),
      name: asText(data?.name, ""),
      description: asText(data?.description, ""),
      type: asText(data?.type, ""),
      targetValue: Number.isFinite(Number(data?.targetValue)) ? Number(data.targetValue) : null
    };
  });

  currentKgi = {
    kgiName: asText(kgiData?.name ?? kgiData?.title ?? kgiData?.kgiName, "名称未設定KGI"),
    goalDescription: asText(kgiData?.goalDescription ?? kgiData?.goal ?? kgiData?.goalText ?? kgiData?.description, "ゴール説明は未設定です。"),
    targetDate: asText(kgiData?.targetDate ?? kgiData?.deadline ?? kgiData?.dueDate, ""),
    roadmapPhases: normalizedRoadmapPhases
  };
  renderKpiPlanningBadges();
  updateAiTaskGenerationUi();
};

const saveAiTaskCandidate = async (index, saveButton) => {
  const candidate = aiTaskCandidates[index];
  if (!candidate) {
    return;
  }
  const savedAiTaskCount = currentTasksForKpi.filter((task) => asText(task?.source, "") === "ai").length;
  if (savedAiTaskCount >= MAX_SAVED_AI_TASKS_PER_KPI) {
    aiTaskGenerateStatus.textContent = `保存済みAIタスクは最大${MAX_SAVED_AI_TASKS_PER_KPI}件までです。完了済みタスクの整理後に再度お試しください。`;
    return;
  }
  saveButton.disabled = true;
  try {
    await addDoc(collection(db, "tasks"), {
      title: asText(candidate.title, "名称未設定タスク"),
      description: asText(candidate.description, ""),
      stage: asText(candidate.stage, "build"),
      type: asText(candidate.type, "one_time"),
      progressValue: Number.isFinite(Number(candidate.progressValue)) ? Number(candidate.progressValue) : 1,
      priority: Number.isFinite(Number(candidate.priority)) ? Number(candidate.priority) : 1,
      status: "active",
      isCompleted: false,
      source: "ai",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      kpiId,
      kgiId,
      phaseId
    });
    aiTaskCandidates.splice(index, 1);
    renderAiTaskCandidates();
    aiTaskGenerateStatus.textContent = "AI候補を1件採用して保存しました。";
    await loadTasks();
  } catch (error) {
    console.error(error);
    aiTaskGenerateStatus.textContent = "AI候補の保存に失敗しました。";
    saveButton.disabled = false;
  }
};

const generateAiTasks = async () => {
  if (!currentKpi || !currentKgi) {
    aiTaskGenerateStatus.textContent = "KPIまたはKGIの読み込みが完了していません。";
    return;
  }
  const gate = getAiTaskGenerationGate();
  if (!gate.isAllowed) {
    aiTaskGenerateStatus.textContent = gate.reason;
    updateAiTaskGenerationUi();
    return;
  }
  const activeTaskCount = countActiveTasks(currentTasksForKpi);
  if (activeTaskCount >= MAX_ACTIVE_TASKS_FOR_AI_GENERATION) {
    aiTaskCandidates = [];
    renderAiTaskCandidates();
    aiTaskGenerateStatus.textContent = "このKPIには進行中のタスクがすでに3件あります。まずは既存タスクを進めてください。";
    return;
  }

  generateAiTaskButton.disabled = true;
  aiTaskCandidates = [];
  renderAiTaskCandidates();
  aiTaskGenerateStatus.textContent = "AIがタスク候補を生成中です...";

  const payload = {
    kgiName: currentKgi.kgiName,
    goalDescription: currentKgi.goalDescription,
    roadmapPhases: currentKgi.roadmapPhases,
    targetPhase: currentTargetPhase,
    allKpis: allKpisForKgi,
    targetKpi: {
      id: currentKpi.id,
      name: asText(currentKpi.name, ""),
      description: asText(currentKpi.description, ""),
      type: asText(currentKpi.type, "action"),
      targetValue: Number.isFinite(Number(currentKpi.targetValue)) ? Number(currentKpi.targetValue) : null
    },
    existingTasksForTargetKpi: currentTasksForKpi.map((task) => toPlainTask(task)),
    targetDate: currentKgi.targetDate,
    phaseDeadline: asText(currentTargetPhase?.deadline, "")
  };

  try {
    const response = await fetch("/api/generate-tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(asText(data?.error, "AI生成に失敗しました。"));
    }

    const responseTasks = Array.isArray(data?.tasks) ? data.tasks : [];
    const deduplicatedTasks = filterDuplicateCandidates(responseTasks, currentTasksForKpi)
      .slice(0, AI_TASK_CANDIDATE_COUNT);
    if (!deduplicatedTasks.length) {
      aiTaskCandidates = [];
      renderAiTaskCandidates();
      aiTaskGenerateStatus.textContent = asText(data?.generationStoppedReason, "今は新しい候補はありません。既存タスクを進めてください。");
      return;
    }
    aiTaskCandidates = deduplicatedTasks;
    renderAiTaskCandidates();
    aiTaskGenerateStatus.textContent = `AI候補を生成しました（未保存の候補${deduplicatedTasks.length}件）。必要なものだけ「このタスクを採用」を押してください。`;
  } catch (error) {
    console.error(error);
    aiTaskGenerateStatus.textContent = `AI生成に失敗しました: ${asText(error?.message, "unknown error")}`;
  } finally {
    updateAiTaskGenerationUi();
  }
};

const createTask = async () => {
  if (!currentKpi) {
    return;
  }

  const title = taskTitleInput.value.trim();
  const description = taskDescriptionInput.value.trim();
  const gate = getAiTaskGenerationGate();
  if (!gate.isAllowed) {
    taskCreateStatus.textContent = gate.reason;
    updateAiTaskGenerationUi();
    return;
  }
  if (!title) {
    taskCreateStatus.textContent = "タスク名を入力してください。";
    return;
  }
  if (!japaneseTextPattern.test(title)) {
    taskCreateStatus.textContent = "タスク名は日本語で入力してください。";
    return;
  }

  createTaskButton.disabled = true;
  taskCreateStatus.textContent = "保存中...";

  try {
    await addDoc(collection(db, "tasks"), {
      title,
      description,
      status: "active",
      isCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      kpiId,
      kgiId,
      phaseId
    });

    taskTitleInput.value = "";
    taskDescriptionInput.value = "";
    taskCreateStatus.textContent = "タスクを追加しました。";
    await loadKpi();
    await loadTasks();
  } catch (error) {
    console.error(error);
    taskCreateStatus.textContent = "タスクの追加に失敗しました。";
  } finally {
    createTaskButton.disabled = false;
  }
};

const completeTask = async (taskId, completeButton) => {
  completeButton.disabled = true;

  try {
    await updateDoc(doc(db, "tasks", taskId), {
      status: "completed",
      isCompleted: true,
      updatedAt: serverTimestamp()
    });
    await loadTasks();
  } catch (error) {
    console.error(error);
    alert("タスク完了の更新に失敗しました。");
    completeButton.disabled = false;
  }
};

const init = async () => {
  if (!kgiId || !phaseId || !kpiId) {
    kpiStatus.textContent = "URLが不正です。id / phaseId / kpiId を確認してください。";
    return;
  }

  backToPhaseLink.href = `./phase.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(phaseId)}`;

  try {
        db = await getDb();
    await loadKpi();
    await loadKgiContext();
  } catch (error) {
    const { code, message } = formatErrorDetail(error);
    console.error("[KPI doc load failed]", { code, message });
    kpiStatus.textContent = `KPI詳細の読み込みに失敗しました。 code=${code} / message=${message}`;
    taskStatus.textContent = "";
    return;
  }

  try {
    await loadTasks();
  } catch (error) {
    console.error("[Unexpected tasks load flow error]", error);
  }
};

createTaskButton.addEventListener("click", () => {
  void createTask();
});
generateAiTaskButton.addEventListener("click", () => {
  void generateAiTasks();
});

void init();
