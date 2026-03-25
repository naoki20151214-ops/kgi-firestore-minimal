import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";
import { enhanceReadableText } from "./readable-text.js";

const backToKgiLink = document.getElementById("backToKgiLink");
const phaseName = document.getElementById("phaseName");
const phaseStatus = document.getElementById("phaseStatus");
const phaseMeta = document.getElementById("phaseMeta");
const phasePurpose = document.getElementById("phasePurpose");
const phaseDeadline = document.getElementById("phaseDeadline");
const kpiStatus = document.getElementById("kpiStatus");
const kpiList = document.getElementById("kpiList");
const kpiNameInput = document.getElementById("kpiNameInput");
const kpiDescriptionInput = document.getElementById("kpiDescriptionInput");
const createKpiButton = document.getElementById("createKpiButton");
const generateAiKpiButton = document.getElementById("generateAiKpiButton");
const aiGenerateStatus = document.getElementById("aiGenerateStatus");
const aiCandidateList = document.getElementById("aiCandidateList");

const params = new URLSearchParams(window.location.search);
const kgiId = params.get("id")?.trim() ?? "";
const phaseId = params.get("phaseId")?.trim() ?? "";

let db;
let currentPhase = null;
let currentKgi = null;
let currentKpis = [];
let aiCandidates = [];

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

const normalizePhase = (phase, index = 0) => {
  const phaseNumber = Number.isFinite(Number(phase?.phaseNumber)) ? Number(phase.phaseNumber) : index + 1;

  return {
    id: asText(phase?.id, `phase_${phaseNumber}`),
    name: asText(phase?.title ?? phase?.name, `フェーズ${phaseNumber}`),
    purpose: asText(phase?.description ?? phase?.goal ?? phase?.summary, "説明は未設定です。"),
    deadline: asText(phase?.deadline ?? phase?.targetDate ?? phase?.dueDate, "期限未設定"),
    phaseNumber
  };
};

const normalizeKpi = (kpiDoc) => {
  const data = kpiDoc?.data?.() ?? kpiDoc;

  return {
    id: asText(kpiDoc?.id, ""),
    name: asText(data?.name, "名称未設定KPI"),
    description: asText(data?.description, "説明は未設定です。"),
    type: asText(data?.type, ""),
    targetValue: Number.isFinite(Number(data?.targetValue)) ? Number(data.targetValue) : null,
    ...data
  };
};

const renderPhase = (phase) => {
  phaseName.textContent = `フェーズ${phase.phaseNumber}: ${phase.name}`;
  phasePurpose.textContent = phase.purpose;
  enhanceReadableText(phasePurpose, {
    lines: Number(phasePurpose.dataset.lines) || 3
  });
  phaseDeadline.textContent = phase.deadline;
  phaseMeta.hidden = false;
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

    const actions = document.createElement("div");
    actions.className = "candidate-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "このKPIを保存";
    saveButton.addEventListener("click", () => {
      void saveAiCandidate(index, saveButton);
    });

    actions.appendChild(saveButton);
    item.append(title, description, meta, actions);
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

  if (!rawPhase) {
    throw new Error("PHASE_NOT_FOUND");
  }

  const phaseIndex = (Array.isArray(kgiData?.roadmapPhases)
    ? kgiData.roadmapPhases.findIndex((phase) => asText(phase?.id, "") === phaseId)
    : -1);
  currentPhase = normalizePhase(rawPhase, phaseIndex >= 0 ? phaseIndex : 0);
  renderPhase(currentPhase);

  const kpisSnapshot = await getDocs(query(collection(db, "kpis"), where("kgiId", "==", kgiId), where("phaseId", "==", currentPhase.id)));
  currentKpis = kpisSnapshot.docs.map((kpiDoc) => normalizeKpi(kpiDoc));
  renderKpis(currentKpis);
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
  targetValue: Number.isFinite(Number(kpiPayload.targetValue)) ? Math.max(1, Math.round(Number(kpiPayload.targetValue))) : 1,
  progress: 0,
  isCompleted: false,
  source: asText(kpiPayload.source, "manual"),
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  status: "active"
});

const createKpi = async () => {
  if (!currentPhase) {
    return;
  }

  const name = kpiNameInput.value.trim();
  const description = kpiDescriptionInput.value.trim();

  if (!name) {
    alert("KPI名を入力してください。");
    return;
  }

  createKpiButton.disabled = true;

  try {
    await saveKpiDocument({
      name,
      description,
      source: "manual"
    });

    kpiNameInput.value = "";
    kpiDescriptionInput.value = "";
    await loadPhaseAndKpis();
  } catch (error) {
    console.error(error);
    alert("KPI作成に失敗しました。再試行してください。");
  } finally {
    createKpiButton.disabled = false;
  }
};

const generateAiKpis = async () => {
  if (!currentPhase || !currentKgi) {
    return;
  }

  generateAiKpiButton.disabled = true;
  aiGenerateStatus.classList.remove("error");
  aiGenerateStatus.textContent = "AIがKPI候補を作成しています...";

  try {
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
        phaseDeadline: currentPhase.deadline
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(asText(payload?.error, "AIでKPI候補を作成できませんでした。"));
    }

    const generated = Array.isArray(payload?.kpis) ? payload.kpis : [];
    aiCandidates = generated
      .map((item) => ({
        name: asText(item?.name, ""),
        description: asText(item?.description, ""),
        type: asText(item?.type, "action"),
        targetValue: Number.isFinite(Number(item?.targetValue)) ? Number(item.targetValue) : null,
        source: "ai_phase"
      }))
      .filter((item) => item.name);

    renderAiCandidates();

    if (!aiCandidates.length) {
      aiGenerateStatus.classList.add("error");
      aiGenerateStatus.textContent = "候補が生成されませんでした。入力情報を見直して再実行してください。";
      return;
    }

    aiGenerateStatus.classList.remove("error");
    aiGenerateStatus.textContent = `${aiCandidates.length}件のKPI候補を作成しました。必要な候補を保存してください。`;
  } catch (error) {
    console.error(error);
    aiCandidates = [];
    renderAiCandidates();
    aiGenerateStatus.classList.add("error");
    aiGenerateStatus.textContent = asText(error?.message, "AIでKPI候補の生成に失敗しました。");
  } finally {
    generateAiKpiButton.disabled = false;
  }
};

const saveAiCandidate = async (index, saveButton) => {
  const candidate = aiCandidates[index];
  if (!candidate) {
    return;
  }

  saveButton.disabled = true;

  try {
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
  void generateAiKpis();
});

void init();
