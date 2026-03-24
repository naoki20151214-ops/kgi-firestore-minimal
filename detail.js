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

  const renderDoc = (data) => {
    const name = asDisplayText(data?.name, "KGI詳細");
    const description = asDisplayText(data?.description);
    const startDate = asDisplayText(data?.startDate);
    const targetDate = asDisplayText(data?.targetDate);

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

  const showLoadError = () => {
    if (detailFieldsElement) {
      detailFieldsElement.hidden = true;
    }
    setStatus("読み込みに失敗しました。再読み込みしてください。", true);
  };

  const init = async () => {
    const searchParams = new URLSearchParams(window.location.search);
    const kgiId = searchParams.get("id")?.trim() ?? "";

    if (!kgiId) {
      showLoadError();
      return;
    }

    try {
      const db = await getDb();
      const kgiRef = doc(db, "kgis", kgiId);
      const kgiSnapshot = await getDoc(kgiRef);

      if (!kgiSnapshot.exists()) {
        showLoadError();
        return;
      }

      renderDoc(kgiSnapshot.data());
    } catch (error) {
      console.error("Failed to load detail document", error);
      showLoadError();
    }
  };

  void init();
}
