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

  const ensureDebugElement = () => {
    const existing = document.getElementById("debugInfo");
    if (existing) {
      return existing;
    }

    const debugElement = document.createElement("pre");
    debugElement.id = "debugInfo";
    debugElement.style.marginTop = "12px";
    debugElement.style.padding = "12px";
    debugElement.style.borderRadius = "8px";
    debugElement.style.backgroundColor = "#111827";
    debugElement.style.color = "#f9fafb";
    debugElement.style.fontSize = "12px";
    debugElement.style.lineHeight = "1.5";
    debugElement.style.whiteSpace = "pre-wrap";
    debugElement.style.wordBreak = "break-all";

    statusTextElement?.insertAdjacentElement("afterend", debugElement);
    return debugElement;
  };

  const setStatus = (text, isError = false) => {
    if (!statusTextElement) {
      return;
    }
    statusTextElement.textContent = text;
    statusTextElement.classList.toggle("error", isError);
  };

  const renderDebugInfo = ({
    kgiId,
    requestedDocPath,
    exists,
    errorCode,
    errorMessage,
    rootCause
  }) => {
    const debugElement = ensureDebugElement();

    const lines = [
      "[detail debug]",
      `KGI ID: ${kgiId || "(empty)"}`,
      `requested path: ${requestedDocPath}`,
      `snapshot.exists(): ${typeof exists === "boolean" ? String(exists) : "unknown"}`,
      `error.code: ${errorCode || "none"}`,
      `error.message: ${errorMessage || "none"}`,
      `rootCause: ${rootCause || "unknown"}`
    ];

    debugElement.textContent = lines.join("\n");
    debugElement.hidden = false;
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

  const getCandidateDebugLines = (data, keys, label) => (
    `${label}: ${keys.map((key) => `${key}=${JSON.stringify(formatUnknownValue(data?.[key]))}`).join(", ")}`
  );

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

    const debugElement = ensureDebugElement();
    const prev = debugElement.textContent || "";
    const rawKeys = Object.keys(data ?? {});
    const debugLines = [
      prev,
      "",
      "[detail debug: field mapping]",
      `raw keys: ${JSON.stringify(rawKeys)}`,
      getCandidateDebugLines(data, titleCandidates, "raw title candidate values"),
      getCandidateDebugLines(data, goalCandidates, "raw goal candidate values"),
      getCandidateDebugLines(data, startDateCandidates, "raw startDate candidate values"),
      getCandidateDebugLines(data, targetDateCandidates, "raw targetDate candidate values")
    ].filter(Boolean);

    debugElement.textContent = debugLines.join("\n");
    debugElement.hidden = false;

    setStatus("");
  };

  const showLoadError = (message) => {
    if (detailFieldsElement) {
      detailFieldsElement.hidden = true;
    }
    setStatus(message, true);
  };

  const classifyRootCause = ({ kgiId, exists, errorCode }) => {
    if (!kgiId) {
      return "JS側の参照ミス（URLのidが空）";
    }

    if (typeof errorCode === "string") {
      if (
        errorCode.includes("permission-denied")
        || errorCode.includes("unauthenticated")
        || errorCode.includes("failed-precondition")
      ) {
        return "Firestore permission/rules";
      }

      if (errorCode.includes("invalid-argument") || errorCode.includes("not-found")) {
        return "collection path mismatch または doc not found";
      }
    }

    if (exists === false) {
      return "doc not found（path は読めているが document が存在しない）";
    }

    return "JS側の参照ミス または collection path mismatch";
  };

  const init = async () => {
    const searchParams = new URLSearchParams(window.location.search);
    const kgiId = searchParams.get("id")?.trim() ?? "";
    const requestedDocPath = `kgis/${kgiId || "(empty-id)"}`;

    if (!kgiId) {
      const rootCause = classifyRootCause({ kgiId, exists: null, errorCode: "missing-id" });
      renderDebugInfo({
        kgiId,
        requestedDocPath,
        exists: null,
        errorCode: "missing-id",
        errorMessage: "URL query parameter id is empty",
        rootCause
      });
      showLoadError("読み込みに失敗しました。URLのKGI IDを確認してください。");
      return;
    }

    try {
      const db = await getDb();
      const kgiRef = doc(db, "kgis", kgiId);
      const kgiSnapshot = await getDoc(kgiRef);
      const exists = kgiSnapshot.exists();
      const rootCause = classifyRootCause({ kgiId, exists, errorCode: "" });

      renderDebugInfo({
        kgiId,
        requestedDocPath,
        exists,
        errorCode: "",
        errorMessage: "",
        rootCause
      });

      if (!exists) {
        showLoadError("このKGIは見つからないか、すでに存在しません");
        return;
      }

      renderDoc(kgiSnapshot.data());
    } catch (error) {
      const errorCode = typeof error?.code === "string" ? error.code : "unknown";
      const errorMessage = typeof error?.message === "string" ? error.message : String(error);
      const rootCause = classifyRootCause({ kgiId, exists: null, errorCode });

      console.error("Failed to load detail document", {
        requestedDocPath,
        kgiId,
        errorCode,
        errorMessage,
        error
      });

      renderDebugInfo({
        kgiId,
        requestedDocPath,
        exists: null,
        errorCode,
        errorMessage,
        rootCause
      });

      showLoadError("読み込みに失敗しました。再読み込みしてください。");
    }
  };

  void init();
}
