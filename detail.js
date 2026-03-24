import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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

  const renderDoc = (data) => {
    const titleCandidates = ["title", "name", "kgiName"];
    const goalCandidates = ["goalDescription", "goal", "description", "goalText"];
    const startDateCandidates = ["startDate", "createdDate", "createdAt"];
    const targetDateCandidates = ["targetDate", "deadline", "dueDate", "targetDeadline"];

    const name = pickFirstDisplayValue(data, titleCandidates, "KGI詳細");
    const description = pickFirstDisplayValue(data, goalCandidates);
    const startDate = pickFirstDisplayValue(data, startDateCandidates);
    const targetDate = pickFirstDisplayValue(data, targetDateCandidates);

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

    setStatus("");
  };

  const showLoadError = (message) => {
    if (detailFieldsElement) {
      detailFieldsElement.hidden = true;
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
