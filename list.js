import {
  collection,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const statusText = document.getElementById("statusText");
const tableWrap = document.getElementById("tableWrap");
const tableBody = document.getElementById("kgiTableBody");
const emptyState = document.getElementById("emptyState");

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const formatDateValue = (value) => {
  if (!value) {
    return "-";
  }

  if (typeof value === "string") {
    const matched = value.match(/^\d{4}-\d{2}-\d{2}$/);
    if (matched) {
      return value.replaceAll("-", "/");
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}/${month}/${day}`;
    }

    return "-";
  }

  if (typeof value.toDate === "function") {
    const date = value.toDate();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  }

  return "-";
};

const renderRows = (docs) => {
  tableBody.innerHTML = "";

  docs.forEach((docItem) => {
    const data = docItem.data();
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${formatDateValue(data.createdAt)}</td>
      <td><a href="./detail.html?id=${docItem.id}">${data.name ?? ""}</a></td>
      <td>${data.target ?? ""}</td>
      <td>${formatDateValue(data.deadline)}</td>
    `;

    tableBody.appendChild(row);
  });
};

(async () => {
  try {
    const db = await getDb();
    const kgisRef = collection(db, "kgis");
    const kgisQuery = query(kgisRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(kgisQuery);

    if (snapshot.empty) {
      setStatus("データは0件です。");
      emptyState.hidden = false;
      return;
    }

    renderRows(snapshot.docs);
    tableWrap.hidden = false;
    setStatus(`${snapshot.size}件のKGIを表示しています。`);
  } catch (error) {
    console.error(error);
    setStatus("一覧の読み込みに失敗しました。Firebase設定とルールを確認してください。", true);
  }
})();
