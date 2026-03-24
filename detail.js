import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const bodyPage = document.body?.dataset?.page ?? "detail";

if (bodyPage === "phase") {
  // 一時軽量化のため detail ページのみを対象に動作。
  // phase ページ側の重い処理は無効化する。
} else {
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
  const kpiTotalCountElement = document.getElementById("kpiTotalCount");
  const kpiCompletedCountElement = document.getElementById("kpiCompletedCount");

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
      const title = pickFirstDisplayValue(phase, ["title", "name"], `フェーズ${index + 1}`);
      const description = pickFirstDisplayValue(phase, ["description", "goal", "summary"], "");
      const phaseNumberRaw = Number(phase?.phaseNumber);
      const phaseNumber = Number.isFinite(phaseNumberRaw) ? phaseNumberRaw : index + 1;

      return {
        title,
        description,
        phaseNumber
      };
    });
  };

  const renderRoadmap = (phases = []) => {
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

      const title = document.createElement("div");
      title.className = "roadmap-title";
      title.textContent = `フェーズ${phase.phaseNumber ?? index + 1}: ${phase.title}`;

      const description = document.createElement("p");
      description.className = "roadmap-description";
      description.textContent = asDisplayText(phase.description, "説明は未設定です。");

      item.append(title, description);
      fragment.appendChild(item);
    });

    roadmapListElement.appendChild(fragment);
    roadmapEmptyElement.hidden = true;
    roadmapSectionElement.hidden = false;
  };

  const renderKpiSummary = ({ total = 0, completed = 0 } = {}) => {
    if (!kpiSummarySectionElement || !kpiTotalCountElement || !kpiCompletedCountElement) {
      return;
    }

    kpiTotalCountElement.textContent = String(total);
    kpiCompletedCountElement.textContent = String(completed);
    kpiSummarySectionElement.hidden = false;
  };

  const loadKpiSummary = async (db, kgiId) => {
    try {
      const kpiCollectionRef = collection(db, "kgis", kgiId, "kpis");
      const [totalSnapshot, completedSnapshot] = await Promise.all([
        getCountFromServer(kpiCollectionRef),
        getCountFromServer(query(kpiCollectionRef, where("isCompleted", "==", true)))
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
      renderKpiSummary({ total: 0, completed: 0 });
    }
  };

  const renderDoc = (data) => {
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

    renderRoadmap(roadmapPhases);

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

      renderDoc(kgiSnapshot.data());
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
}
