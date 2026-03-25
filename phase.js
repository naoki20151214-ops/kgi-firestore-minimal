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
const aiFocusInput = document.getElementById("aiFocusInput");

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

const AI_REGENERATE_COOLDOWN_MS = 60 * 1000;

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

  generateAiKpiButton.textContent = hasGeneratedAiCandidates
    ? "AI候補を再生成する"
    : "AIでこのフェーズのKPIを作成";
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
  currentRoadmapPhases = normalizeRoadmapPhasesFromKgi(kgiData);

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

  if (isDuplicateKpiNameInPhase(name, currentKpis)) {
    alert("同じフェーズに重複するKPI名があるため保存できません。名称を変更してください。");
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
      type: asText(kpi.type, "action")
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
        focusOrAvoid
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
        targetValue: Number.isFinite(Number(item?.targetValue)) ? Number(item.targetValue) : null,
        source: "ai_phase"
      }))
      .filter((item) => item.name);

    const filteredCandidates = [];
    normalizedCandidates.forEach((candidate) => {
      const duplicatedWithExisting = isDuplicateKpiNameInPhase(candidate.name, currentKpis);
      const duplicatedInCandidates = isDuplicateKpiNameInPhase(candidate.name, filteredCandidates);
      if (!duplicatedWithExisting && !duplicatedInCandidates) {
        filteredCandidates.push(candidate);
      }
    });

    aiCandidates = filteredCandidates;
    hasGeneratedAiCandidates = true;
    lastAiGenerationAt = Date.now();

    renderAiCandidates();

    const decisionText = buildAiDecisionStatusText({
      decision,
      reason,
      duplicates,
      missingCategories,
      proposedCount: aiCandidates.length
    });

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
    aiGenerateStatus.classList.add("error");
    aiGenerateStatus.textContent = asText(error?.message, "AIでKPI候補の生成に失敗しました。");
  } finally {
    isGeneratingAiKpis = false;
    updateGenerateAiButtonState();
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
  void generateAiKpis();
});

void init();
