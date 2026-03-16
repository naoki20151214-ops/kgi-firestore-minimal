import {
  collection,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const statusText = document.getElementById("statusText");
const table = document.getElementById("kgiTable");
const tableBody = document.getElementById("kgiTableBody");
const emptyState = document.getElementById("emptyState");

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const formatCreatedAt = (createdAt) => {
  if (!createdAt) {
    return "-";
  }

  return createdAt.toDate().toLocaleString("ja-JP");
};

const renderRows = (docs) => {
  tableBody.innerHTML = "";

  docs.forEach((docItem) => {
    const data = docItem.data();
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${data.emoji ?? ""}</td>
      <td>${data.name ?? ""}</td>
      <td>${data.target ?? ""}</td>
      <td>${formatCreatedAt(data.createdAt)}</td>
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
    table.hidden = false;
    setStatus(`${snapshot.size}件のKGIを表示しています。`);
  } catch (error) {
    console.error(error);
    setStatus("一覧の読み込みに失敗しました。Firebase設定とルールを確認してください。", true);
  }
})();
