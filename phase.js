import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";
import { enhanceReadableText } from "./readable-text.js";
import { decideNowAction } from "./now-action-engine.js";

const backToKgiLink = document.getElementById("backToKgiLink");
const phaseName = document.getElementById("phaseName");
const phaseStatus = document.getElementById("phaseStatus");
const phaseMeta = document.getElementById("phaseMeta");
const phasePurpose = document.getElementById("phasePurpose");
const phaseDeadline = document.getElementById("phaseDeadline");
const phaseMeaningBlock = document.getElementById("phaseMeaningBlock");
const phaseMeaningList = document.getElementById("phaseMeaningList");
const kpiStatus = document.getElementById("kpiStatus");
const kpiList = document.getElementById("kpiList");
const kpiNameInput = document.getElementById("kpiNameInput");
const kpiDescriptionInput = document.getElementById("kpiDescriptionInput");
const kpiCategoryInput = document.getElementById("kpiCategoryInput");
const createKpiButton = document.getElementById("createKpiButton");
const generateAiKpiButton = document.getElementById("generateAiKpiButton");
const aiGenerateStatus = document.getElementById("aiGenerateStatus");
const aiSectionTitle = document.getElementById("aiSectionTitle");
const aiSectionDescription = document.getElementById("aiSectionDescription");
const phasePlanningStatusText = document.getElementById("phasePlanningStatusText");
const aiCandidateList = document.getElementById("aiCandidateList");
const aiFocusInput = document.getElementById("aiFocusInput");
const aiNoAdditionalBox = document.getElementById("aiNoAdditionalBox");
const aiCleanupBox = document.getElementById("aiCleanupBox");
const aiCleanupProposalBox = document.getElementById("aiCleanupProposalBox");
const aiCleanupProposalSummary = document.getElementById("aiCleanupProposalSummary");
const aiCleanupProposalList = document.getElementById("aiCleanupProposalList");
const applyAiCleanupButton = document.getElementById("applyAiCleanupButton");

const params = new URLSearchParams(window.location.search);
const kgiId = params.get("id")?.trim() ?? "";
const phaseId = params.get("phaseId")?.trim() ?? "";

let db;
let currentPhase = null;
let currentKgi = null;
let currentKpis = [];
let currentRoadmapPhases = [];
let aiCandidates = [];
let isGeneratingAiKpis = false;
let hasGeneratedAiCandidates = false;
let lastAiGenerationAt = null;
let lastAiDecision = "";
let currentPhasePlanningStatus = "draft";
let currentCleanupProposal = null;

const AI_REGENERATE_COOLDOWN_MS = 60 * 1000;
const KPI_CATEGORIES = ["acquisition", "activation", "retention", "feedback", "monetization", "decision"];
const PHASE_PLANNING_STATUSES = new Set(["draft", "cleanup_needed", "finalized"]);

const asText = (value, fallback = "-") => {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const formatUnknownValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const fromUnixMs = new Date(value);
    if (!Number.isNaN(fromUnixMs.getTime())) {
      return fromUnixMs.toISOString().slice(0, 10);
    }
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const pickFirstDisplayValue = (data, keys, fallback = "-") => {
  for (const key of keys) {
    const normalized = asText(formatUnknownValue(data?.[key]), "");
    if (normalized) {
      return normalized;
    }
  }

  return fallback;
};

const getPhaseFromKgi = (kgiData, phaseIdValue) => {
  const phases = Array.isArray(kgiData?.roadmapPhases) ? kgiData.roadmapPhases : [];
  const byId = phases.find((phase) => asText(phase?.id, "") === phaseIdValue);

  if (byId) {
    return byId;
  }

  return phases.find((phase, index) => `phase_${index + 1}` === phaseIdValue) ?? null;
};

const normalizeRoadmapPhasesFromKgi = (kgiData) => {
  const phases = Array.isArray(kgiData?.roadmapPhases) ? kgiData.roadmapPhases : [];
  return phases.map((phase, index) => normalizePhase(phase, index));
};

const normalizePhase = (phase, index = 0) => {
  const phaseNumber = Number.isFinite(Number(phase?.phaseNumber)) ? Number(phase.phaseNumber) : index + 1;

  return {
    id: asText(phase?.id, `phase_${phaseNumber}`),
    name: asText(phase?.title ?? phase?.name, `フェーズ${phaseNumber}`),
    purpose: asText(phase?.description ?? phase?.goal ?? phase?.summary, "説明は未設定です。"),
    deadline: asText(phase?.deadline ?? phase?.targetDate ?? phase?.dueDate, "期限未設定"),
    planningStatus: PHASE_PLANNING_STATUSES.has(asText(phase?.kpiPlanningStatus, "draft"))
      ? asText(phase?.kpiPlanningStatus, "draft")
      : "draft",
    phaseNumber
  };
};

const normalizeKpi = (kpiDoc) => {
  const data = kpiDoc?.data?.() ?? kpiDoc;
  const category = asText(data?.category, "").toLowerCase();

  return {
    id: asText(kpiDoc?.id, ""),
    name: asText(data?.name, "名称未設定KPI"),
    description: asText(data?.description, "説明は未設定です。"),
    type: asText(data?.type, ""),
    category: KPI_CATEGORIES.includes(category) ? category : "",
    targetValue: Number.isFinite(Number(data?.targetValue)) ? Number(data.targetValue) : null,
    ...data
  };
};

const normalizeKpiNameForDuplicateCheck = (value) => asText(value, "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[‐‑‒–—―ーｰ]/g, "-")
  .replace(/[\s\u3000]/g, "")
  .replace(/[()（）「」『』【】［］\[\]{}｛｝"'`´’‘“”、。・,./\\!?！？:：;；\-＿_]/g, "");

const isDuplicateKpiNameInPhase = (name, kpis) => {
  const exactName = asText(name, "");
  const normalizedName = normalizeKpiNameForDuplicateCheck(name);
  if (!exactName || !normalizedName) {
    return false;
  }

  return kpis.some((kpi) => {
    const existingName = asText(kpi?.name, "");
    if (!existingName) {
      return false;
    }

    if (existingName === exactName) {
      return true;
    }

    return normalizeKpiNameForDuplicateCheck(existingName) === normalizedName;
  });
};

const normalizeKpiRoleSignature = (name, description) => `${asText(name, "")} ${asText(description, "")}`
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[()（）「」『』【】［］\[\]{}｛｝"'`´’‘“”、。・,./\\!?！？:：;；]/g, " ")
  .replace(/[\s\u3000]+/g, " ")
  .trim();

const getRoleTokens = (name, description) => {
  const stopWords = new Set([
    "する", "した", "して", "こと", "ため", "目標", "指標", "kpi", "です", "ます", "いる", "ある", "及び", "また", "への", "から", "まで"
  ]);
  return normalizeKpiRoleSignature(name, description)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token));
};

const hasSimilarKpiRoleInPhase = (candidate, kpis) => {
  const candidateTokens = getRoleTokens(candidate?.name, candidate?.description);
  if (!candidateTokens.length) {
    return false;
  }

  const candidateTokenSet = new Set(candidateTokens);

  return kpis.some((kpi) => {
    const existingTokens = getRoleTokens(kpi?.name, kpi?.description);
    if (!existingTokens.length) {
      return false;
    }

    const overlapCount = existingTokens.filter((token) => candidateTokenSet.has(token)).length;
    const maxTokenLength = Math.max(existingTokens.length, candidateTokens.length);
    const overlapRate = maxTokenLength > 0 ? overlapCount / maxTokenLength : 0;
    return overlapCount >= 2 && overlapRate >= 0.45;
  });
};

const normalizeCategory = (value) => {
  const category = asText(value, "").toLowerCase();
  return KPI_CATEGORIES.includes(category) ? category : "";
};

const hasCategoryDuplicateInPhase = (category, kpis) => {
  const normalizedCategory = normalizeCategory(category);
  if (!normalizedCategory) {
    return false;
  }
  return kpis.some((kpi) => normalizeCategory(kpi?.category) === normalizedCategory);
};

const collectMissingCategories = (kpis) => {
  const existingCategories = new Set(
    kpis.map((kpi) => normalizeCategory(kpi?.category)).filter(Boolean)
  );
  return KPI_CATEGORIES.filter((category) => !existingCategories.has(category));
};

const getRemainingRegenerateCooldownMs = () => {
  if (!lastAiGenerationAt) {
    return 0;
  }

  const elapsed = Date.now() - lastAiGenerationAt;
  return Math.max(0, AI_REGENERATE_COOLDOWN_MS - elapsed);
};

const updateGenerateAiButtonState = () => {
  const cooldownMs = getRemainingRegenerateCooldownMs();
  const inCooldown = cooldownMs > 0;
  generateAiKpiButton.disabled = isGeneratingAiKpis || inCooldown;

  if (isGeneratingAiKpis) {
    generateAiKpiButton.textContent = "AIでKPI候補を生成中...";
    return;
  }

  if (currentPhasePlanningStatus === "cleanup_needed") {
    generateAiKpiButton.textContent = "AIでKPIを整理する";
    return;
  }
  if (currentPhasePlanningStatus === "finalized") {
    generateAiKpiButton.textContent = "KPI整理は完了しています";
    generateAiKpiButton.disabled = true;
    return;
  }
  generateAiKpiButton.textContent = hasGeneratedAiCandidates ? "AIでKPIセットを見直す" : "AIでKPIを作成";
};

const updatePhasePlanningUi = () => {
  if (currentPhasePlanningStatus === "cleanup_needed") {
    aiSectionTitle.textContent = "AIでKPIを整理する";
    aiSectionDescription.textContent = "このフェーズは整理フェーズです。重複検出・統合提案・不要KPI整理を優先します。";
    phasePlanningStatusText.textContent = "このフェーズのKPIはまだ整理中です。整理完了後にタスク生成が解放されます。";
    return;
  }
  if (currentPhasePlanningStatus === "finalized") {
    aiSectionTitle.textContent = "このフェーズのKPI整理は完了しています";
    aiSectionDescription.textContent = "KPIが確定済みです。必要時のみKPI詳細ページでタスクを作成してください。";
    phasePlanningStatusText.textContent = "状態: finalized";
    return;
  }
  aiSectionTitle.textContent = "AIでこのフェーズのKPIを作成";
  aiSectionDescription.textContent = "KGIと全フェーズ情報を使って既存KPIを先に評価し、不足がある場合のみ必要最小限のKPI候補を提案します。";
  phasePlanningStatusText.textContent = "状態: draft（作成フェーズ）";
};

const hideCleanupProposal = () => {
  currentCleanupProposal = null;
  aiCleanupProposalBox.hidden = true;
  aiCleanupProposalSummary.textContent = "";
  aiCleanupProposalList.innerHTML = "";
};

const createPhaseMeaningItems = (phase) => {
  const phaseNumber = Number.isFinite(Number(phase?.phaseNumber)) ? Number(phase.phaseNumber) : 0;
  const phaseNameText = asText(phase?.name, "");

  if (phaseNumber === 1) {
    return [
      {
        title: "このフェーズの役割",
        body: "このフェーズでは、何を作るかと何を見るかを整理します。実装の前に土台を固めて、手戻りを減らすためです。"
      },
      {
        title: "前の流れとのつながり",
        body: "最初のフェーズなので、ここで決めた内容が後ろのフェーズすべての出発点になります。"
      },
      {
        title: "次に進める目安",
        body: "KPIが整理できて、やることの優先順が見えたら、次の実装フェーズに進みやすくなります。"
      }
    ];
  }

  if (phaseNumber === 2) {
    return [
      {
        title: "このフェーズの役割",
        body: "このフェーズでは、前で決めた設計を実際に作って形にします。公開前に内部で動きを確かめる段階です。"
      },
      {
        title: "前の流れとのつながり",
        body: "前のフェーズで整理したKPIや要件を、そのまま実装の判断基準として使います。"
      },
      {
        title: "次に進める目安",
        body: "必要な実装がそろい、基本の動作確認ができたら、公開フェーズに進みやすくなります。"
      }
    ];
  }

  if (phaseNumber === 3) {
    return [
      {
        title: "このフェーズの役割",
        body: "このフェーズでは、作ったものを実際に公開して使ってもらいます。本当に使われるかを確かめる段階です。"
      },
      {
        title: "前の流れとのつながり",
        body: "前で作って確認した機能を、ここでユーザーに届けて反応を見ます。"
      },
      {
        title: "次に進める目安",
        body: "登録や継続利用などのデータが集まり、傾向が見えてきたら次の判断フェーズに進みます。"
      }
    ];
  }

  if (phaseNumber === 4) {
    return [
      {
        title: "このフェーズの役割",
        body: "このフェーズでは、公開後に集まった結果を見て判断します。続けるか、直すか、収益化できそうかを考える段階です。"
      },
      {
        title: "前の流れとのつながり",
        body: "前のフェーズで集めた利用データを使って、良かった点と改善点を整理します。"
      },
      {
        title: "次に進める目安",
        body: "次に何を伸ばし、何を直すかが決まったら、次の改善サイクルへ進みやすくなります。"
      }
    ];
  }

  const inferredStartPhase = phaseNameText.includes("設計") || phaseNameText.includes("整理");
  const inferredReleasePhase = phaseNameText.includes("公開") || phaseNameText.includes("リリース");
  const inferredReviewPhase = phaseNameText.includes("分析") || phaseNameText.includes("改善");

  if (inferredStartPhase) {
    return [
      {
        title: "このフェーズの役割",
        body: "このフェーズでは、まず必要なことを整理して土台を作ります。"
      },
      {
        title: "前の流れとのつながり",
        body: "ここで決めた内容が、次の実装や公開の基準になります。"
      },
      {
        title: "次に進める目安",
        body: "何を作るかと何を見るかがはっきりしたら、次に進めます。"
      }
    ];
  }

  if (inferredReleasePhase) {
    return [
      {
        title: "このフェーズの役割",
        body: "このフェーズでは、作ったものを公開して実際の反応を見ます。"
      },
      {
        title: "前の流れとのつながり",
        body: "前で準備した機能や導線を、ここでユーザーに届けます。"
      },
      {
        title: "次に進める目安",
        body: "使われ方のデータが集まり、次に直すポイントが見えたら進めます。"
      }
    ];
  }

  if (inferredReviewPhase) {
    return [
      {
        title: "このフェーズの役割",
        body: "このフェーズでは、集まった結果を見て次の方針を決めます。"
      },
      {
        title: "前の流れとのつながり",
        body: "前で得たデータを振り返り、続けることと直すことを分けます。"
      },
      {
        title: "次に進める目安",
        body: "改善の優先順が決まったら、次の実行フェーズに進めます。"
      }
    ];
  }

  return [
    {
      title: "このフェーズの役割",
      body: "このフェーズでは、いま必要な作業を進めて次につなげます。"
    },
    {
      title: "前の流れとのつながり",
      body: "前で決めた内容や作ったものを、このフェーズで一歩進めます。"
    },
    {
      title: "次に進める目安",
      body: "このフェーズの目的に沿った結果がそろったら、次へ進みやすくなります。"
    }
  ];
};

const renderPhaseMeaning = (phase) => {
  if (!phaseMeaningBlock || !phaseMeaningList) {
    return;
  }
  const items = createPhaseMeaningItems(phase);
  phaseMeaningList.innerHTML = "";

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const listItem = document.createElement("li");

    const title = document.createElement("p");
    title.className = "phase-meaning-item-title";
    title.textContent = asText(item?.title, "このフェーズの役割");

    const body = document.createElement("p");
    body.className = "phase-meaning-item-body";
    body.textContent = asText(item?.body, "");

    listItem.append(title, body);
    fragment.appendChild(listItem);
  });

  phaseMeaningList.appendChild(fragment);
  phaseMeaningBlock.hidden = items.length === 0;
};

const renderPhase = (phase) => {
  phaseName.textContent = `フェーズ${phase.phaseNumber}: ${phase.name}`;
  phasePurpose.textContent = phase.purpose;
  phasePurpose.classList.add("readable-text--phase");
  enhanceReadableText(phasePurpose, {
    lines: Number(phasePurpose.dataset.lines) || 3,
    formatAsBulletSections: true
  });
  phaseDeadline.textContent = phase.deadline;
  phaseMeta.hidden = false;
  renderPhaseMeaning(phase);
  phaseStatus.textContent = "";
};

const createKpiMetaText = (kpi) => {
  const chunks = [];
  if (asText(kpi.type, "") === "result") {
    chunks.push("種類: 結果KPI");
  } else if (asText(kpi.type, "") === "action") {
    chunks.push("種類: 行動KPI");
  }

  if (Number.isFinite(Number(kpi.targetValue))) {
    chunks.push(`目標値: ${Math.round(Number(kpi.targetValue))}`);
  }
  const category = normalizeCategory(kpi.category);
  if (category) {
    chunks.push(`カテゴリ: ${category}`);
  }

  return chunks.join(" / ");
};

const renderKpis = (kpis) => {
  if (!kpis.length) {
    kpiStatus.textContent = "このフェーズのKPIはまだありません。下のフォームかAI候補から追加してください。";
    kpiList.hidden = true;
    return;
  }

  kpiList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  kpis.forEach((kpi) => {
    const item = document.createElement("li");
    item.className = "kpi-item";

    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.className = "kpi-link";
    link.href = `./kpi.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(currentPhase.id)}&kpiId=${encodeURIComponent(kpi.id)}`;
    link.textContent = asText(kpi.name, "名称未設定KPI");
    title.appendChild(link);

    const description = document.createElement("p");
    description.textContent = asText(kpi.description, "説明は未設定です。");

    const meta = createKpiMetaText(kpi);
    const metaElement = document.createElement("p");
    metaElement.className = "hint";
    metaElement.textContent = meta || "";
    metaElement.hidden = !meta;

    item.append(title, description, metaElement);
    fragment.appendChild(item);
  });

  kpiList.appendChild(fragment);
  kpiList.hidden = false;
  kpiStatus.textContent = `${kpis.length}件のKPIを表示しています。`;
};

const renderAiCandidates = () => {
  if (!aiCandidates.length) {
    aiCandidateList.hidden = true;
    aiCandidateList.innerHTML = "";
    return;
  }

  aiCandidateList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  aiCandidates.forEach((candidate, index) => {
    const item = document.createElement("li");
    item.className = "candidate-item";

    const title = document.createElement("h3");
    title.textContent = asText(candidate.name, `KPI候補 ${index + 1}`);

    const description = document.createElement("p");
    description.textContent = asText(candidate.description, "説明は未設定です。");

    const meta = document.createElement("p");
    meta.className = "candidate-meta";
    meta.textContent = createKpiMetaText(candidate) || "AI候補";

    const shouldShowSaveButton = !isCleanupOnlyDecision(lastAiDecision, []);
    item.append(title, description, meta);

    if (shouldShowSaveButton) {
      const actions = document.createElement("div");
      actions.className = "candidate-actions";

      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.textContent = "このKPIを保存";
      saveButton.addEventListener("click", () => {
        void saveAiCandidate(index, saveButton);
      });

      actions.appendChild(saveButton);
      item.append(actions);
    }
    fragment.appendChild(item);
  });

  aiCandidateList.appendChild(fragment);
  aiCandidateList.hidden = false;
};

const loadPhaseAndKpis = async () => {
  const kgiRef = doc(db, "kgis", kgiId);
  const kgiSnapshot = await getDoc(kgiRef);

  if (!kgiSnapshot.exists()) {
    throw new Error("KGI_NOT_FOUND");
  }

  const kgiData = kgiSnapshot.data();
  currentKgi = {
    id: kgiId,
    name: pickFirstDisplayValue(kgiData, ["name", "title", "kgiName"], "名称未設定KGI"),
    goalText: pickFirstDisplayValue(kgiData, ["goalDescription", "goal", "goalText", "description"], "ゴール説明は未設定です。"),
    targetDate: pickFirstDisplayValue(kgiData, ["targetDate", "deadline", "dueDate", "targetDeadline"], "期限未設定")
  };

  const rawPhase = getPhaseFromKgi(kgiData, phaseId);
  currentRoadmapPhases = normalizeRoadmapPhasesFromKgi(kgiData);

  if (!rawPhase) {
    throw new Error("PHASE_NOT_FOUND");
  }

  const phaseIndex = (Array.isArray(kgiData?.roadmapPhases)
    ? kgiData.roadmapPhases.findIndex((phase) => asText(phase?.id, "") === phaseId)
    : -1);
  currentPhase = normalizePhase(rawPhase, phaseIndex >= 0 ? phaseIndex : 0);
  currentPhasePlanningStatus = currentPhase.planningStatus;
  renderPhase(currentPhase);

  const kpisSnapshot = await getDocs(query(collection(db, "kpis"), where("kgiId", "==", kgiId), where("phaseId", "==", currentPhase.id)));
  currentKpis = kpisSnapshot.docs.map((kpiDoc) => normalizeKpi(kpiDoc));
  renderKpis(currentKpis);
  const phaseAction = decideNowAction({
    kgis: [currentKgi],
    phases: [{ ...currentPhase, kgiId }],
    kpis: currentKpis,
    tasks: [],
    scope: "phase",
    phaseId: currentPhase.id
  });
  if (phaseAction) {
    phasePlanningStatusText.textContent = `今やること: ${phaseAction.title}（${phaseAction.progressSummary}）`;
  }
  updatePhasePlanningUi();
  updateGenerateAiButtonState();
};

const savePhasePlanningStatus = async (nextStatus) => {
  if (!currentKgi?.id || !currentPhase?.id || !PHASE_PLANNING_STATUSES.has(nextStatus)) {
    return;
  }

  const kgiRef = doc(db, "kgis", currentKgi.id);
  const kgiSnapshot = await getDoc(kgiRef);
  if (!kgiSnapshot.exists()) {
    return;
  }
  const kgiData = kgiSnapshot.data();
  const roadmapPhases = Array.isArray(kgiData?.roadmapPhases) ? kgiData.roadmapPhases : [];
  const updatedRoadmapPhases = roadmapPhases.map((phase, index) => {
    const normalized = normalizePhase(phase, index);
    if (normalized.id !== currentPhase.id) {
      return phase;
    }
    return {
      ...phase,
      kpiPlanningStatus: nextStatus
    };
  });
  await updateDoc(kgiRef, {
    roadmapPhases: updatedRoadmapPhases,
    updatedAt: serverTimestamp()
  });
  currentPhasePlanningStatus = nextStatus;
  currentPhase = { ...currentPhase, planningStatus: nextStatus };
  updatePhasePlanningUi();
  updateGenerateAiButtonState();
};

const saveKpiDocument = async (kpiPayload) => addDoc(collection(db, "kpis"), {
  kgiId,
  kgiName: currentKgi?.name ?? "",
  kgiGoalText: currentKgi?.goalText ?? "",
  phaseId: currentPhase.id,
  phaseName: currentPhase.name,
  phasePurpose: currentPhase.purpose,
  phaseDeadline: currentPhase.deadline,
  phaseNumber: currentPhase.phaseNumber,
  name: kpiPayload.name,
  description: kpiPayload.description,
  type: asText(kpiPayload.type, "action"),
  category: normalizeCategory(kpiPayload.category),
  targetValue: Number.isFinite(Number(kpiPayload.targetValue)) ? Math.max(1, Math.round(Number(kpiPayload.targetValue))) : 1,
  progress: 0,
  isCompleted: false,
  source: asText(kpiPayload.source, "manual"),
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  status: "active",
  planningStatus: "draft",
  kpiSetDecision: ""
});

const createKpi = async () => {
  if (!currentPhase) {
    return;
  }

  const name = kpiNameInput.value.trim();
  const description = kpiDescriptionInput.value.trim();
  const category = normalizeCategory(kpiCategoryInput.value);

  if (!name) {
    alert("KPI名を入力してください。");
    return;
  }

  if (isDuplicateKpiNameInPhase(name, currentKpis)) {
    alert("同じフェーズに重複するKPI名があるため保存できません。名称を変更してください。");
    return;
  }
  if (hasSimilarKpiRoleInPhase({ name, description }, currentKpis)) {
    alert("同じフェーズに役割が近いKPIがあるため保存できません。既存KPIの整理を検討してください。");
    return;
  }
  if (!category) {
    alert("KPIカテゴリを選択してください。");
    return;
  }
  if (hasCategoryDuplicateInPhase(category, currentKpis)) {
    alert("同じフェーズでは同じカテゴリのKPIを複数保存できません。");
    return;
  }

  createKpiButton.disabled = true;

  try {
    await saveKpiDocument({
      name,
      description,
      category,
      source: "manual"
    });

    kpiNameInput.value = "";
    kpiDescriptionInput.value = "";
    kpiCategoryInput.value = "";
    await loadPhaseAndKpis();
  } catch (error) {
    console.error(error);
    alert("KPI作成に失敗しました。再試行してください。");
  } finally {
    createKpiButton.disabled = false;
  }
};

const getAiDecisionLabel = (decision) => {
  if (decision === "no_additional_kpis_needed") {
    return "追加不要";
  }

  if (decision === "cleanup_only") {
    return "整理提案のみ";
  }

  if (decision === "propose_missing_only") {
    return "不足分だけ追加提案";
  }

  return "判定なし";
};

const isCleanupOnlyDecision = (decision, duplicates = []) => (
  decision === "cleanup_only" || (Array.isArray(duplicates) && duplicates.length > 0)
);

const buildAiDecisionStatusText = ({ decision, reason, duplicates, missingCategories, proposedCount }) => {
  const chunks = [`判定: ${getAiDecisionLabel(decision)}`];

  if (asText(reason, "")) {
    chunks.push(`理由: ${asText(reason, "")}`);
  }

  if (Array.isArray(duplicates) && duplicates.length > 0) {
    const duplicateNames = duplicates
      .map((item) => asText(item?.kpiName, ""))
      .filter(Boolean)
      .join("、");
    if (duplicateNames) {
      chunks.push(`重複/役割かぶり: ${duplicateNames}`);
    }
  }

  if (Array.isArray(missingCategories) && missingCategories.length > 0) {
    chunks.push(`不足役割: ${missingCategories.map((item) => asText(item, "")).filter(Boolean).join("、")}`);
  }

  if (Number.isFinite(Number(proposedCount))) {
    chunks.push(`提案KPI: ${Math.max(0, Number(proposedCount))}件`);
  }

  return chunks.join(" / ");
};

const updateAiGuidanceBoxes = (decision, duplicates) => {
  const isNoAdditional = decision === "no_additional_kpis_needed";
  const isCleanupOnly = isCleanupOnlyDecision(decision, duplicates);

  aiNoAdditionalBox.hidden = !isNoAdditional;
  aiCleanupBox.hidden = !isCleanupOnly;
  if (isCleanupOnly) {
    aiCleanupBox.querySelector(".ai-guidance-box-title").textContent = "このフェーズは先にKPI整理が必要です";
  }
};

const generateAiKpis = async () => {
  if (!currentPhase || !currentKgi) {
    return;
  }

  if (isGeneratingAiKpis) {
    return;
  }

  const remainingCooldown = getRemainingRegenerateCooldownMs();
  if (remainingCooldown > 0) {
    const remainingSec = Math.ceil(remainingCooldown / 1000);
    aiGenerateStatus.classList.remove("error");
    aiGenerateStatus.textContent = `再生成は${remainingSec}秒後に可能です。`;
    updateGenerateAiButtonState();
    return;
  }

  if (hasGeneratedAiCandidates) {
    const shouldRegenerate = window.confirm("すでにKPI候補を生成しています。再生成すると現在の候補は置き換わります。続行しますか？");
    if (!shouldRegenerate) {
      return;
    }
  }

  isGeneratingAiKpis = true;
  updateGenerateAiButtonState();
  aiGenerateStatus.classList.remove("error");
  aiGenerateStatus.textContent = "AIがKPI候補を作成しています...";

  try {
    const existingKpisForPrompt = currentKpis.map((kpi) => ({
      name: asText(kpi.name, ""),
      description: asText(kpi.description, ""),
      type: asText(kpi.type, "action"),
      category: normalizeCategory(kpi.category)
    })).filter((kpi) => kpi.name);
    const focusOrAvoid = asText(aiFocusInput?.value, "");
    const allPhasesForPrompt = currentRoadmapPhases.map((phase) => ({
      id: asText(phase.id, ""),
      phaseNumber: Number.isFinite(Number(phase.phaseNumber)) ? Number(phase.phaseNumber) : null,
      name: asText(phase.name, ""),
      purpose: asText(phase.purpose, ""),
      deadline: asText(phase.deadline, "期限未設定")
    })).filter((phase) => phase.id && phase.name);

    const response = await fetch("/api/generate-kpis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        kgiName: currentKgi.name,
        goalDescription: currentKgi.goalText,
        phaseName: currentPhase.name,
        phasePurpose: currentPhase.purpose,
        targetDate: currentKgi.targetDate,
        phaseDeadline: currentPhase.deadline,
        existingKpis: existingKpisForPrompt,
        allPhases: allPhasesForPrompt,
        focusOrAvoid,
        categoryPolicy: {
          allowedCategories: KPI_CATEGORIES,
          missingCategories: collectMissingCategories(currentKpis)
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(asText(payload?.error, "AIでKPI候補を作成できませんでした。"));
    }

    const decision = asText(payload?.decision, "");
    const reason = asText(payload?.reason, "");
    const duplicates = Array.isArray(payload?.duplicates) ? payload.duplicates : [];
    const missingCategories = Array.isArray(payload?.missingCategories) ? payload.missingCategories : [];
    const generated = Array.isArray(payload?.proposedKpis)
      ? payload.proposedKpis
      : Array.isArray(payload?.kpis)
        ? payload.kpis
        : [];
    const normalizedCandidates = generated
      .map((item) => ({
        name: asText(item?.name, ""),
        description: asText(item?.description, ""),
        type: asText(item?.type, "action"),
        category: normalizeCategory(item?.category),
        targetValue: Number.isFinite(Number(item?.targetValue)) ? Number(item.targetValue) : null,
        source: "ai_phase"
      }))
      .filter((item) => item.name && item.category);

    const cleanupOnly = isCleanupOnlyDecision(decision, duplicates);
    lastAiDecision = cleanupOnly ? "cleanup_only" : decision;
    const filteredCandidates = [];
    normalizedCandidates.forEach((candidate) => {
      const duplicatedWithExisting = isDuplicateKpiNameInPhase(candidate.name, currentKpis);
      const duplicatedByRole = hasSimilarKpiRoleInPhase(candidate, currentKpis);
      const duplicatedCategoryWithExisting = hasCategoryDuplicateInPhase(candidate.category, currentKpis);
      const duplicatedInCandidates = isDuplicateKpiNameInPhase(candidate.name, filteredCandidates);
      const duplicatedCategoryInCandidates = hasCategoryDuplicateInPhase(candidate.category, filteredCandidates);
      if (
        !duplicatedWithExisting
        && !duplicatedInCandidates
        && !duplicatedByRole
        && !duplicatedCategoryWithExisting
        && !duplicatedCategoryInCandidates
      ) {
        filteredCandidates.push(candidate);
      }
    });

    aiCandidates = cleanupOnly ? [] : filteredCandidates;
    hasGeneratedAiCandidates = true;
    lastAiGenerationAt = Date.now();

    renderAiCandidates();
    updateAiGuidanceBoxes(decision, duplicates);
    if (decision === "no_additional_kpis_needed" || cleanupOnly) {
      await savePhasePlanningStatus("cleanup_needed");
    }

    const decisionText = buildAiDecisionStatusText({
      decision,
      reason,
      duplicates,
      missingCategories,
      proposedCount: aiCandidates.length
    });

    if (cleanupOnly) {
      aiGenerateStatus.classList.remove("error");
      aiGenerateStatus.textContent = `${decisionText} / このフェーズは先にKPI整理が必要です。`;
      return;
    }

    if (!aiCandidates.length) {
      aiGenerateStatus.classList.remove("error");
      aiGenerateStatus.textContent = decisionText || "判定の結果、追加提案はありませんでした。";
      return;
    }

    aiGenerateStatus.classList.remove("error");
    aiGenerateStatus.textContent = `${decisionText} / 必要な候補を保存してください。`;
  } catch (error) {
    console.error(error);
    aiCandidates = [];
    renderAiCandidates();
    updateAiGuidanceBoxes("", []);
    lastAiDecision = "";
    aiGenerateStatus.classList.add("error");
    aiGenerateStatus.textContent = asText(error?.message, "AIでKPI候補の生成に失敗しました。");
  } finally {
    isGeneratingAiKpis = false;
    updateGenerateAiButtonState();
  }
};

const renderCleanupProposal = (proposal) => {
  const duplicateItems = Array.isArray(proposal?.duplicateGroups) ? proposal.duplicateGroups : [];
  const mergeItems = Array.isArray(proposal?.mergeSuggestions) ? proposal.mergeSuggestions : [];
  const removeItems = Array.isArray(proposal?.removeSuggestions) ? proposal.removeSuggestions : [];
  const finalItems = Array.isArray(proposal?.finalKpis) ? proposal.finalKpis : [];

  aiCleanupProposalSummary.textContent = asText(proposal?.summary, "整理案を確認し、問題なければ一括適用してください。");
  aiCleanupProposalList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  [...duplicateItems, ...mergeItems, ...removeItems, ...finalItems].forEach((item) => {
    const li = document.createElement("li");
    li.className = "candidate-item";
    li.textContent = asText(item?.label, JSON.stringify(item));
    fragment.appendChild(li);
  });
  aiCleanupProposalList.appendChild(fragment);
  aiCleanupProposalBox.hidden = false;
};

const generateAiCleanupProposal = async () => {
  if (!currentPhase || !currentKgi) {
    return;
  }
  isGeneratingAiKpis = true;
  updateGenerateAiButtonState();
  aiGenerateStatus.classList.remove("error");
  aiGenerateStatus.textContent = "AIがKPI整理案を作成しています...";
  hideCleanupProposal();
  try {
    const response = await fetch("/api/generate-kpi-cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kgiName: currentKgi.name,
        phaseName: currentPhase.name,
        phasePurpose: currentPhase.purpose,
        existingKpis: currentKpis.map((kpi) => ({
          id: kpi.id,
          name: asText(kpi.name, ""),
          description: asText(kpi.description, ""),
          type: asText(kpi.type, "action"),
          category: normalizeCategory(kpi.category)
        }))
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(asText(payload?.error, "AI整理案の生成に失敗しました。"));
    }
    currentCleanupProposal = payload;
    renderCleanupProposal(payload);
    aiGenerateStatus.textContent = "AI整理案を作成しました。内容を確認して一括適用してください。";
  } catch (error) {
    console.error(error);
    aiGenerateStatus.classList.add("error");
    aiGenerateStatus.textContent = asText(error?.message, "AI整理案の生成に失敗しました。");
  } finally {
    isGeneratingAiKpis = false;
    updateGenerateAiButtonState();
  }
};

const applyAiCleanupProposal = async () => {
  if (!currentCleanupProposal) {
    return;
  }
  const shouldApply = window.confirm("AI整理案を一括適用します。不要KPIの削除を含みます。続行しますか？");
  if (!shouldApply) {
    return;
  }

  applyAiCleanupButton.disabled = true;
  aiGenerateStatus.classList.remove("error");
  aiGenerateStatus.textContent = "整理案を適用中です...";
  try {
    const removeSuggestions = Array.isArray(currentCleanupProposal?.removeSuggestions)
      ? currentCleanupProposal.removeSuggestions
      : [];
    for (const item of removeSuggestions) {
      const targetId = asText(item?.kpiId, "");
      if (!targetId) {
        continue;
      }
      await deleteDoc(doc(db, "kpis", targetId));
    }
    await savePhasePlanningStatus("finalized");
    await loadPhaseAndKpis();
    hideCleanupProposal();
    aiGenerateStatus.textContent = "整理案を適用し、フェーズをfinalizedに更新しました。";
  } catch (error) {
    console.error(error);
    aiGenerateStatus.classList.add("error");
    aiGenerateStatus.textContent = asText(error?.message, "整理案の適用に失敗しました。");
  } finally {
    applyAiCleanupButton.disabled = false;
  }
};

const saveAiCandidate = async (index, saveButton) => {
  const candidate = aiCandidates[index];
  if (!candidate) {
    return;
  }

  saveButton.disabled = true;

  try {
    if (isDuplicateKpiNameInPhase(candidate.name, currentKpis)) {
      alert("同じフェーズに重複するKPIがあるため、この候補は保存できません。");
      aiCandidates.splice(index, 1);
      renderAiCandidates();
      return;
    }
    if (hasSimilarKpiRoleInPhase(candidate, currentKpis)) {
      alert("同じフェーズに役割が近いKPIがあるため、この候補は保存できません。");
      aiCandidates.splice(index, 1);
      renderAiCandidates();
      return;
    }
    if (hasCategoryDuplicateInPhase(candidate.category, currentKpis)) {
      alert("同じカテゴリのKPIがすでにあるため、この候補は保存できません。");
      aiCandidates.splice(index, 1);
      renderAiCandidates();
      return;
    }

    await saveKpiDocument(candidate);
    aiCandidates.splice(index, 1);
    renderAiCandidates();

    if (!aiCandidates.length) {
      aiGenerateStatus.classList.remove("error");
      aiGenerateStatus.textContent = "候補をすべて保存しました。";
    }

    await loadPhaseAndKpis();
  } catch (error) {
    console.error(error);
    alert("AI候補の保存に失敗しました。再試行してください。");
    saveButton.disabled = false;
  }
};

const init = async () => {
  if (!kgiId || !phaseId) {
    phaseStatus.textContent = "URLが不正です。KGI ID と phaseId を確認してください。";
    phaseStatus.classList.add("error");
    kpiStatus.textContent = "";
    return;
  }

  backToKgiLink.href = `./detail.html?id=${encodeURIComponent(kgiId)}`;

  try {
    db = await getDb();
    await loadPhaseAndKpis();
    updateAiGuidanceBoxes("", []);
    hideCleanupProposal();
    updateGenerateAiButtonState();
  } catch (error) {
    console.error(error);
    phaseStatus.textContent = "フェーズの読み込みに失敗しました。";
    phaseStatus.classList.add("error");
    kpiStatus.textContent = "";
  }
};

createKpiButton.addEventListener("click", () => {
  void createKpi();
});

generateAiKpiButton.addEventListener("click", () => {
  if (currentPhasePlanningStatus === "cleanup_needed") {
    void generateAiCleanupProposal();
    return;
  }
  void generateAiKpis();
});
applyAiCleanupButton.addEventListener("click", () => {
  void applyAiCleanupProposal();
});

void init();
