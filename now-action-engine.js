const asText = (value, fallback = "") => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
};

const toMs = (value) => {
  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return 0;
};

const normalizeTask = (task) => {
  const status = asText(task?.ticketStatus ?? task?.status, "active").toLowerCase();
  const isCompleted = Boolean(task?.isCompleted) || status === "completed" || status === "done";
  const isInProgress = !isCompleted && (status === "active" || status === "in_progress" || status === "doing");
  return {
    ...task,
    status,
    isCompleted,
    isInProgress
  };
};

const createHref = ({ actionType, kgiId = "", phaseId = "", kpiId = "" }) => {
  if (actionType === "create_kgi") {
    return "./index.html";
  }
  if (actionType === "create_roadmap") {
    return `./detail.html?id=${encodeURIComponent(kgiId)}&focus=roadmap`;
  }
  if (actionType === "review") {
    return `./detail.html?id=${encodeURIComponent(kgiId)}`;
  }
  if (actionType === "create_kpi" || actionType === "cleanup_kpi") {
    return `./phase.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(phaseId)}`;
  }
  return `./kpi.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(phaseId)}&kpiId=${encodeURIComponent(kpiId)}`;
};

const buildAction = ({
  actionType,
  targetLevel,
  targetKgiId = "",
  targetPhaseId = "",
  targetKpiId = "",
  title,
  reason,
  stageLabel,
  buttonLabel,
  priority,
  progressSummary
}) => ({
  actionType,
  targetLevel,
  targetKgiId,
  targetPhaseId,
  targetKpiId,
  title,
  reason,
  stageLabel,
  buttonLabel,
  href: createHref({ actionType, kgiId: targetKgiId, phaseId: targetPhaseId, kpiId: targetKpiId }),
  priority,
  progressSummary
});

const getKgiName = (kgi) => asText(kgi?.name ?? kgi?.title ?? kgi?.kgiName, "名称未設定KGI");
const getPhaseStatus = (phase) => asText(phase?.kpiPlanningStatus ?? phase?.planningStatus, "draft").toLowerCase();
const getKpiStatus = (kpi) => asText(kpi?.status, "draft").toLowerCase();

const getOrderedPhases = (phases = []) => [...phases].sort((a, b) => {
  const numA = Number(a?.phaseNumber);
  const numB = Number(b?.phaseNumber);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
    return numA - numB;
  }
  return asText(a?.id, "").localeCompare(asText(b?.id, ""), "ja");
});

const resolveForKgi = ({ kgi, phases = [], kpis = [], tasksByKpiId = new Map() }) => {
  const kgiId = asText(kgi?.id, "");
  const orderedPhases = getOrderedPhases(phases);

  if (orderedPhases.length === 0) {
    return buildAction({
      actionType: "create_roadmap",
      targetLevel: "kgi",
      targetKgiId: kgiId,
      title: "ロードマップを作成する",
      reason: "このKGIは大きな流れが未作成のため、先にフェーズ設計が必要です",
      stageLabel: "ロードマップ未作成",
      buttonLabel: `${getKgiName(kgi)}のロードマップを作る`,
      priority: 2,
      progressSummary: "ロードマップ未作成"
    });
  }

  const noKpiPhase = orderedPhases.find((phase) => {
    const phaseId = asText(phase?.id, "");
    return kpis.filter((kpi) => asText(kpi?.phaseId, "") === phaseId).length === 0;
  });
  if (noKpiPhase) {
    return buildAction({
      actionType: "create_kpi",
      targetLevel: "phase",
      targetKgiId: kgiId,
      targetPhaseId: asText(noKpiPhase.id, ""),
      title: "フェーズでKPIを作成する",
      reason: "まだ数字の目標がないため、先にKPI作成が必要です",
      stageLabel: "KPI未出力",
      buttonLabel: "このフェーズでKPIを作る",
      priority: 3,
      progressSummary: "KPI未出力"
    });
  }

  const cleanupPhase = orderedPhases.find((phase) => {
    const status = getPhaseStatus(phase);
    return status === "draft" || status === "cleanup_needed";
  });
  if (cleanupPhase) {
    return buildAction({
      actionType: "cleanup_kpi",
      targetLevel: "phase",
      targetKgiId: kgiId,
      targetPhaseId: asText(cleanupPhase.id, ""),
      title: "KPIを整理して確定する",
      reason: "KPIが未確定のままではタスク作成に進むと手戻りが増えるためです",
      stageLabel: "KPI整理中",
      buttonLabel: "このフェーズでKPIを整理する",
      priority: 4,
      progressSummary: "KPI整理中"
    });
  }

  const finalizedKpis = kpis.filter((kpi) => getKpiStatus(kpi) === "finalized");
  const tasklessKpi = finalizedKpis.find((kpi) => (tasksByKpiId.get(kpi.id) ?? []).length === 0);
  if (tasklessKpi) {
    return buildAction({
      actionType: "create_task",
      targetLevel: "kpi",
      targetKgiId: kgiId,
      targetPhaseId: asText(tasklessKpi.phaseId, ""),
      targetKpiId: asText(tasklessKpi.id, ""),
      title: "最初のタスクを1件作る",
      reason: "KPIは確定済みで、まだ実行タスクがないためです",
      stageLabel: "タスク0件",
      buttonLabel: "このKPIでタスクを作る",
      priority: 5,
      progressSummary: "タスク0件"
    });
  }

  const normalizedKpis = finalizedKpis.map((kpi) => ({
    ...kpi,
    tasks: (tasksByKpiId.get(kpi.id) ?? []).map(normalizeTask)
  }));
  const inProgressKpi = normalizedKpis.find((kpi) => kpi.tasks.some((task) => task.isInProgress));
  if (inProgressKpi) {
    const inProgressCount = inProgressKpi.tasks.filter((task) => task.isInProgress).length;
    return buildAction({
      actionType: "execute_task",
      targetLevel: "task",
      targetKgiId: kgiId,
      targetPhaseId: asText(inProgressKpi.phaseId, ""),
      targetKpiId: asText(inProgressKpi.id, ""),
      title: "進行中タスクを進める",
      reason: "すでに着手中の作業があるため、まずは中断中の実行を進めるのが自然です",
      stageLabel: "タスク実行",
      buttonLabel: "このTaskを見る",
      priority: 6,
      progressSummary: `進行中タスク${inProgressCount}件`
    });
  }

  const resumableKpi = normalizedKpis.find((kpi) => kpi.tasks.some((task) => !task.isCompleted));
  if (resumableKpi) {
    return buildAction({
      actionType: "resume_task",
      targetLevel: "kpi",
      targetKgiId: kgiId,
      targetPhaseId: asText(resumableKpi.phaseId, ""),
      targetKpiId: asText(resumableKpi.id, ""),
      title: "未完了タスクに着手する",
      reason: "次の未完了タスクから進める段階です",
      stageLabel: "未完了タスク",
      buttonLabel: "このKPIを開く",
      priority: 7,
      progressSummary: "未完了タスクあり"
    });
  }

  const allTasks = normalizedKpis.flatMap((kpi) => kpi.tasks);
  const doneCount = allTasks.filter((task) => task.isCompleted).length;
  const progressCount = allTasks.filter((task) => task.isInProgress).length;
  return buildAction({
    actionType: "review",
    targetLevel: "kgi",
    targetKgiId: kgiId,
    title: "見直しと次の一手を考える",
    reason: "現在の作業が一通り完了しているためです",
    stageLabel: "見直し",
    buttonLabel: "このKGIを開く",
    priority: 8,
    progressSummary: `完了済み${doneCount}件 / 進行中${progressCount}件`
  });
};

export const decideNowAction = ({
  kgis = [],
  phases = [],
  kpis = [],
  tasks = [],
  scope = "global",
  kgiId = "",
  phaseId = "",
  kpiId = ""
} = {}) => {
  if (!Array.isArray(kgis) || kgis.length === 0) {
    return buildAction({
      actionType: "create_kgi",
      targetLevel: "global",
      title: "新しいKGIを作成する",
      reason: "まず目標がないため、最初のKGI作成が必要です",
      stageLabel: "KGI未作成",
      buttonLabel: "KGIを作成する",
      priority: 1,
      progressSummary: "KGI未作成"
    });
  }

  const inScopeKgis = scope === "kgi" ? kgis.filter((kgi) => kgi.id === kgiId) : kgis;
  const buildForKgi = (targetKgi) => {
    const targetPhases = phases.filter((phase) => asText(phase?.kgiId, "") === targetKgi.id);
    const targetKpis = kpis.filter((kpi) => asText(kpi?.kgiId, "") === targetKgi.id);
    const tasksByKpiId = new Map();
    targetKpis.forEach((kpi) => {
      tasksByKpiId.set(kpi.id, tasks.filter((task) => asText(task?.kpiId, "") === kpi.id));
    });
    return resolveForKgi({ kgi: targetKgi, phases: targetPhases, kpis: targetKpis, tasksByKpiId });
  };

  if (scope === "kpi") {
    const targetKpi = kpis.find((item) => item.id === kpiId);
    if (!targetKpi) {
      return null;
    }
    return resolveForKgi({
      kgi: { id: targetKpi.kgiId, name: "" },
      phases: phases.filter((phase) => phase.id === targetKpi.phaseId),
      kpis: [targetKpi],
      tasksByKpiId: new Map([[targetKpi.id, tasks.filter((task) => asText(task?.kpiId, "") === targetKpi.id)]])
    });
  }

  if (scope === "phase") {
    const targetPhase = phases.find((item) => item.id === phaseId);
    if (!targetPhase) {
      return null;
    }
    const targetKpis = kpis.filter((item) => item.phaseId === targetPhase.id);
    const tasksByKpiId = new Map(targetKpis.map((kpi) => [kpi.id, tasks.filter((task) => task.kpiId === kpi.id)]));
    return resolveForKgi({
      kgi: { id: targetPhase.kgiId, name: "" },
      phases: [targetPhase],
      kpis: targetKpis,
      tasksByKpiId
    });
  }

  if (scope === "kgi") {
    const target = inScopeKgis[0];
    return target ? buildForKgi(target) : null;
  }

  const scored = inScopeKgis.map((kgi) => {
    const action = buildForKgi(kgi);
    const updatedAtMs = toMs(kgi?.updatedAt) || toMs(kgi?.createdAt);
    return {
      kgiId: kgi.id,
      action,
      score: (10 - action.priority) * 1000000000000 + updatedAtMs
    };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.action ?? null;
};

export const getNowActionStageWeight = (actionType) => ({
  create_kgi: 80,
  create_roadmap: 70,
  create_kpi: 60,
  cleanup_kpi: 50,
  create_task: 40,
  execute_task: 30,
  resume_task: 20,
  review: 0
}[actionType] ?? 0);

export const getNowActionImportance = (actionType) => ({
  create_kgi: 5,
  create_roadmap: 4,
  create_kpi: 4,
  cleanup_kpi: 4,
  create_task: 3,
  execute_task: 5,
  resume_task: 4,
  review: 2
}[actionType] ?? 3);
