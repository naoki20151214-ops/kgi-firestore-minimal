import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";
import { enhanceReadableText } from "./readable-text.js";

const kgiNameElement = document.getElementById("kgiName");
const statusTextElement = document.getElementById("statusText");
const detailFieldsElement = document.getElementById("detailFields");
const goalDescriptionElement = document.getElementById("goalDescription");
const startDateElement = document.getElementById("startDate");
const targetDateElement = document.getElementById("targetDate");
const roadmapSectionElement = document.getElementById("roadmapSection");
const roadmapListElement = document.getElementById("roadmapList");
const roadmapEmptyElement = document.getElementById("roadmapEmpty");
const kpiSummarySectionElement = document.getElementById("kpiSummarySection");
const kpiSummaryTextElement = document.getElementById("kpiSummaryText");

const setStatus = (text, isError = false) => {
  if (!statusTextElement) {
    return;
  }
  statusTextElement.textContent = text;
  statusTextElement.classList.toggle("error", isError);
};

const asDisplayText = (value, fallback = "-") => {
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
    const raw = data?.[key];
    const normalized = asDisplayText(formatUnknownValue(raw), "");
    if (normalized !== "") {
      return normalized;
    }
  }

  return fallback;
};

const normalizeRoadmapPhases = (phases) => {
  if (!Array.isArray(phases)) {
    return [];
  }

  return phases.map((phase, index) => {
    const phaseNumberRaw = Number(phase?.phaseNumber);
    const phaseNumber = Number.isFinite(phaseNumberRaw) ? phaseNumberRaw : index + 1;

    return {
      id: asDisplayText(phase?.id, `phase_${phaseNumber}`),
      title: pickFirstDisplayValue(phase, ["title", "name"], `フェーズ${index + 1}`),
      purpose: pickFirstDisplayValue(phase, ["description", "goal", "summary"], "説明は未設定です。"),
      deadline: pickFirstDisplayValue(phase, ["deadline", "targetDate", "dueDate"], "期限未設定"),
      phaseNumber
    };
  });
};

const renderRoadmap = ({ kgiId, phases = [] }) => {
  if (!roadmapSectionElement || !roadmapListElement || !roadmapEmptyElement) {
    return;
  }

  roadmapListElement.innerHTML = "";

  if (phases.length === 0) {
    roadmapSectionElement.hidden = false;
    roadmapEmptyElement.hidden = false;
    return;
  }

  const fragment = document.createDocumentFragment();

  phases.forEach((phase, index) => {
    const item = document.createElement("li");

    const titleLink = document.createElement("a");
    titleLink.className = "roadmap-title-link";
    titleLink.href = `./phase.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(phase.id)}`;
    titleLink.textContent = `フェーズ${phase.phaseNumber ?? index + 1}: ${phase.title}`;

    const purpose = document.createElement("p");
    purpose.className = "roadmap-description";
    purpose.textContent = asDisplayText(phase.purpose, "説明は未設定です。");
    enhanceReadableText(purpose, { lines: 3 });

    const deadline = document.createElement("p");
    deadline.className = "roadmap-deadline";
    deadline.textContent = `期限: ${asDisplayText(phase.deadline, "期限未設定")}`;

    item.append(titleLink, purpose, deadline);
    fragment.appendChild(item);
  });

  roadmapListElement.appendChild(fragment);
  roadmapEmptyElement.hidden = true;
  roadmapSectionElement.hidden = false;
};

const renderKpiSummary = ({ total = 0, completed = 0 } = {}) => {
  if (!kpiSummarySectionElement || !kpiSummaryTextElement) {
    return;
  }

  if (total <= 0) {
    kpiSummarySectionElement.hidden = true;
    return;
  }

  kpiSummaryTextElement.textContent = `このKGIには ${total}件のKPIがあり、完了は ${completed}件です。詳細は各フェーズページで確認します。`;
  kpiSummarySectionElement.hidden = false;
};

const loadKpiSummary = async (db, kgiId) => {
  try {
    const kpiCollectionRef = collection(db, "kpis");
    const [totalSnapshot, completedSnapshot] = await Promise.all([
      getCountFromServer(query(kpiCollectionRef, where("kgiId", "==", kgiId))),
      getCountFromServer(query(kpiCollectionRef, where("kgiId", "==", kgiId), where("isCompleted", "==", true)))
    ]);

    renderKpiSummary({
      total: totalSnapshot.data().count ?? 0,
      completed: completedSnapshot.data().count ?? 0
    });
  } catch (error) {
    console.warn("Failed to load KPI summary. Continue without summary.", {
      kgiId,
      error
    });
    kpiSummarySectionElement.hidden = true;
  }
};

const renderDoc = ({ kgiId, data }) => {
  const titleCandidates = ["title", "name", "kgiName"];
  const goalCandidates = ["goalDescription", "goal", "description", "goalText"];
  const startDateCandidates = ["startDate", "createdDate", "createdAt"];
  const targetDateCandidates = ["targetDate", "deadline", "dueDate", "targetDeadline"];

  const name = pickFirstDisplayValue(data, titleCandidates, "KGI詳細");
  const description = pickFirstDisplayValue(data, goalCandidates);
  const startDate = pickFirstDisplayValue(data, startDateCandidates);
  const targetDate = pickFirstDisplayValue(data, targetDateCandidates);
  const roadmapPhases = normalizeRoadmapPhases(data?.roadmapPhases);

  if (kgiNameElement) {
    kgiNameElement.textContent = name;
  }
  if (goalDescriptionElement) {
    goalDescriptionElement.textContent = description;
    enhanceReadableText(goalDescriptionElement, {
      lines: Number(goalDescriptionElement.dataset.lines) || 3
    });
  }
  if (startDateElement) {
    startDateElement.textContent = startDate;
  }
  if (targetDateElement) {
    targetDateElement.textContent = targetDate;
  }

  if (detailFieldsElement) {
    detailFieldsElement.hidden = false;
  }

  renderRoadmap({ kgiId, phases: roadmapPhases });
  setStatus("");
};

const showLoadError = (message) => {
  if (detailFieldsElement) {
    detailFieldsElement.hidden = true;
  }
  if (roadmapSectionElement) {
    roadmapSectionElement.hidden = true;
  }
  if (kpiSummarySectionElement) {
    kpiSummarySectionElement.hidden = true;
  }
  setStatus(message, true);
};

const init = async () => {
  const searchParams = new URLSearchParams(window.location.search);
  const kgiId = searchParams.get("id")?.trim() ?? "";

  if (!kgiId) {
    showLoadError("読み込みに失敗しました。URLのKGI IDを確認してください。");
    return;
  }

  try {
    const db = await getDb();
    const kgiRef = doc(db, "kgis", kgiId);
    const kgiSnapshot = await getDoc(kgiRef);

    if (!kgiSnapshot.exists()) {
      showLoadError("このKGIは見つからないか、すでに存在しません");
      return;
    }

    renderDoc({ kgiId, data: kgiSnapshot.data() });
    await loadKpiSummary(db, kgiId);
  } catch (error) {
    console.error("Failed to load detail document", {
      kgiId,
      error
    });
    showLoadError("読み込みに失敗しました。再読み込みしてください。");
  }
};

void init();
