const STAGES = [
  {
    key: "kgi",
    label: "KGI作成",
    caption: "現在地: 今はKGIを定義する段階です。",
    buildHref: () => "./index.html",
  },
  {
    key: "phase",
    label: "フェーズ設計",
    caption: "現在地: 今はロードマップのフェーズを設計する段階です。",
    buildHref: ({ id }) => (id ? `./detail.html?id=${encodeURIComponent(id)}` : null),
  },
  {
    key: "kpi",
    label: "KPI設計",
    caption: "現在地: 今は各フェーズのKPIを整理する段階です。",
    buildHref: ({ id, phaseId }) => {
      if (!id || !phaseId) return null;
      return `./phase.html?id=${encodeURIComponent(id)}&phaseId=${encodeURIComponent(phaseId)}`;
    },
  },
  {
    key: "task",
    label: "タスク設計・実行",
    caption: "現在地: 今はタスクを作って実行に進める段階です。",
    buildHref: ({ id, phaseId, kpiId }) => {
      if (!id || !phaseId || !kpiId) return null;
      return `./kpi.html?id=${encodeURIComponent(id)}&phaseId=${encodeURIComponent(phaseId)}&kpiId=${encodeURIComponent(kpiId)}`;
    },
  },
];

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get("id"),
    phaseId: params.get("phaseId"),
    kpiId: params.get("kpiId"),
  };
}

function renderFlowNav(nav) {
  const currentKey = nav.dataset.currentStage;
  const currentIndex = STAGES.findIndex((stage) => stage.key === currentKey);
  if (currentIndex < 0) return;

  const caption = nav.querySelector(".flow-nav-caption");
  if (caption) {
    caption.textContent = STAGES[currentIndex].caption;
  }

  const list = nav.querySelector(".flow-nav-list");
  if (!list) return;
  list.innerHTML = "";

  const params = getParams();

  STAGES.forEach((stage, index) => {
    const item = document.createElement("li");
    item.className = "flow-nav-item";

    if (index < currentIndex) {
      item.classList.add("is-completed");
    } else if (index === currentIndex) {
      item.classList.add("is-current");
    } else {
      item.classList.add("is-upcoming");
    }

    const canClick = index <= currentIndex;
    const href = canClick ? stage.buildHref(params) : null;

    if (href) {
      const link = document.createElement("a");
      link.className = "flow-nav-link";
      link.href = href;
      link.textContent = stage.label;
      item.append(link);
      item.classList.add("is-clickable");
    } else {
      const text = document.createElement("span");
      text.className = "flow-nav-text";
      text.textContent = stage.label;
      item.append(text);
      item.classList.add("is-static");
    }

    list.append(item);
  });
}

document.querySelectorAll(".flow-nav[data-current-stage]").forEach(renderFlowNav);
