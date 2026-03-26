const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはPDCAアプリのTask生成AIです。KGI全体・全KPI・対象KPI・既存Taskを踏まえ、対象KPIに必要なTaskを日本語JSONのみで返してください。

最重要ルール:
- 必ず3件だけ返す（増やさない）
- すべて「今すぐ着手する最小の次の一歩」にする
- 30分〜2時間以内に着手・完了しやすい粒度を優先する
- KPIごとに最低1つは「Next Action」としてそのまま使えるTaskを含める
- 先頭のTaskは5分以内に着手できる、1ステップで完結する具体行動にする
- 抽象表現は禁止（例: 調査する、戦略を考える）
- 良い例: 競合記事を3つ開く / 読者候補1人にDM送る / noteのタイトルを1つ書く
- titleは短い行動文、descriptionは1行の補足説明にする
- stage は必ず setup / research / decision / build / launch / review のいずれかを入れる（迷う場合は build を返す）
- Taskはすべて対象KPIに直接つながる内容にする
- 他KPIと重複するTask名や内容は避ける
- フェーズ目的と期限に沿って自然な順序にする
- 1人開発前提で、外部チーム前提の会議・依頼・担当者アサイン・Slack共有依頼は禁止
- 未作成の資料・未整備の体制を前提にしない
- 初期段階で不要な管理表・運用設計・過度に細かい分析運用は禁止
- 「まず確認する」「まず1つ作る」「まず定義する」レベルを優先する`;

const TASK_RESPONSE_SCHEMA = {
  name: "generate_tasks_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["tasks"],
    properties: {
      tasks: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "stage", "type", "progressValue", "priority"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            stage: { type: "string", enum: ["setup", "research", "decision", "build", "launch", "review"] },
            type: { type: "string", enum: ["one_time"] },
            progressValue: { type: "integer", enum: [1] },
            priority: { type: "integer", minimum: 1, maximum: 3 }
          }
        }
      }
    }
  }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isValidReflectionResult = (value) => (
  value === "as_planned"
  || value === "harder_than_expected"
  || value === "needs_improvement"
  || value === "could_not_do"
);

const getRequestBody = (req) => {
  if (!req.body) {
    return null;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return req.body;
};

const extractOutputText = (responseData) => {
  if (typeof responseData?.output_text === "string" && responseData.output_text.trim()) {
    return responseData.output_text.trim();
  }

  if (!Array.isArray(responseData?.output)) {
    return "";
  }

  for (const outputItem of responseData.output) {
    if (!Array.isArray(outputItem?.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (contentItem?.type === "output_text" && typeof contentItem.text === "string" && contentItem.text.trim()) {
        return contentItem.text.trim();
      }
    }
  }

  return "";
};

const extractStructuredOutput = (responseData) => {
  if (responseData?.output_parsed && typeof responseData.output_parsed === "object") {
    return responseData.output_parsed;
  }

  if (!Array.isArray(responseData?.output)) {
    return null;
  }

  for (const outputItem of responseData.output) {
    if (!Array.isArray(outputItem?.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (contentItem?.type === "output_json" && contentItem.json && typeof contentItem.json === "object") {
        return contentItem.json;
      }

      if (contentItem?.type === "json_schema" && contentItem.json && typeof contentItem.json === "object") {
        return contentItem.json;
      }

      if (contentItem?.parsed && typeof contentItem.parsed === "object") {
        return contentItem.parsed;
      }
    }
  }

  return null;
};

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

const normalizeRecentReflections = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const taskTitle = typeof item?.taskTitle === "string" ? item.taskTitle.trim() : "";
      const comment = typeof item?.comment === "string" ? item.comment.trim() : "";
      const result = item?.result;

      if (!taskTitle || !isValidReflectionResult(result)) {
        return null;
      }

      return {
        taskTitle,
        result,
        comment
      };
    })
    .filter(Boolean)
    .slice(0, 5);
};

const COMMENT_DIFFICULTY_KEYWORDS = ["難しい", "分からない", "わからない", "専門用語", "大変"];
const MAX_ADAPTATION_HINTS = 5;

const isCommentDifficult = (comment) => COMMENT_DIFFICULTY_KEYWORDS.some((keyword) => comment.includes(keyword));

const buildAdaptationHints = (recentReflections) => {
  const hintSet = new Set();

  recentReflections.forEach((reflection) => {
    const comment = typeof reflection?.comment === "string" ? reflection.comment.trim() : "";
    const result = reflection?.result;
    const hasDifficultySignal = result === "harder_than_expected" || isCommentDifficult(comment);

    if (hasDifficultySignal) {
      hintSet.add("専門用語を減らす");
      hintSet.add("小さなステップに分ける");
      hintSet.add("説明を増やす");
    }

    if (result === "could_not_do") {
      hintSet.add("準備タスクから始める");
      hintSet.add("一度に要求する作業量を減らす");
    }

    if (result === "needs_improvement") {
      hintSet.add("順番を明確にする");
      hintSet.add("曖昧な表現を避ける");
    }
  });

  return Array.from(hintSet).slice(0, MAX_ADAPTATION_HINTS);
};

const buildTaskPrompt = ({
  kgiName,
  goalDescription,
  roadmapPhases,
  targetPhase,
  allKpis,
  targetKpi,
  existingTasksForTargetKpi,
  targetDate,
  phaseDeadline,
  adaptationHints
}) => JSON.stringify({
  kgiName,
  goalDescription: goalDescription || "未設定",
  roadmapPhases: Array.isArray(roadmapPhases) ? roadmapPhases : [],
  targetPhase: targetPhase ?? null,
  allKpis: Array.isArray(allKpis) ? allKpis : [],
  targetKpi: targetKpi ?? null,
  existingTasksForTargetKpi: Array.isArray(existingTasksForTargetKpi) ? existingTasksForTargetKpi : [],
  targetDate: targetDate || "",
  phaseDeadline: phaseDeadline || "",
  adaptationHints,
  output: {
    tasks: "3件固定",
    language: "ja",
    type: "one_time",
    progressValue: 1,
    priorityRange: [1, 3],
    stageRule: "Every task must include stage and it must be one of: setup, research, decision, build, launch, review. If unsure, use build.",
    firstTaskRule: "The first task must be usable as the immediate Next Action.",
    descriptionRule: "Each description must explain the concrete action in one line."
  }
});

const TASK_STAGES = ["setup", "research", "decision", "build", "launch", "review"];
const normalizeTaskStage = (stage) => {
  const normalized = typeof stage === "string" ? stage.trim().toLowerCase() : "";
  return TASK_STAGES.includes(normalized) ? normalized : "build";
};

const FALLBACK_TASK_TITLE = "最初の一歩を決める";
const FALLBACK_TASK_DESCRIPTION = "KPI達成に向けて、最初に着手する具体的な作業を1つ決めて実行する。";

const normalizeTaskTitle = (value, index, fallbacks = []) => {
  if (isNonEmptyString(value)) {
    return value.trim();
  }

  for (const fallback of fallbacks) {
    if (isNonEmptyString(fallback)) {
      return fallback.trim();
    }
  }

  return index === 0 ? FALLBACK_TASK_TITLE : `補完Task ${index + 1}`;
};

const normalizeTaskDescription = (value, title) => {
  if (isNonEmptyString(value)) {
    return value.trim();
  }

  return `${title} を安全に進めるための補完Taskです。`;
};

const normalizeTaskPriority = (value) => {
  const priority = Number(value);

  if (!Number.isFinite(priority) || priority < 0) {
    return 0;
  }

  if (priority > 3) {
    return 3;
  }

  return Math.trunc(priority);
};

const normalizeDependsOnTaskIds = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const normalizeTaskItem = (value, index) => {
  const title = normalizeTaskTitle(value?.title, index, [value?.kpi, value?.text]);

  return {
    title,
    description: normalizeTaskDescription(value?.description, title),
    stage: normalizeTaskStage(value?.stage),
    type: "one_time",
    progressValue: 1,
    priority: normalizeTaskPriority(value?.priority),
    status: "todo",
    dependsOnTaskIds: normalizeDependsOnTaskIds(value?.dependsOnTaskIds)
  };
};

const buildFallbackTasks = (taskTitle = FALLBACK_TASK_TITLE) => [{
  title: isNonEmptyString(taskTitle) ? taskTitle.trim() : FALLBACK_TASK_TITLE,
  description: FALLBACK_TASK_DESCRIPTION,
  stage: "build",
  type: "one_time",
  progressValue: 1,
  priority: 0,
  status: "todo",
  dependsOnTaskIds: []
}, {
  title: "現状を1つ確認する",
  description: "着手前に必要な入力・画面・データを1つだけ確認する。",
  stage: "setup",
  type: "one_time",
  progressValue: 1,
  priority: 1,
  status: "todo",
  dependsOnTaskIds: []
}, {
  title: "最小アウトプットを1つ作る",
  description: "KPI前進に直結する最小成果物を1つ作って保存する。",
  stage: "build",
  type: "one_time",
  progressValue: 1,
  priority: 1,
  status: "todo",
  dependsOnTaskIds: []
}];

const getTaskItemsFromParsedResponse = (parsed) => {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  if (Array.isArray(parsed.tasks)) {
    return parsed.tasks;
  }

  if (Array.isArray(parsed.items)) {
    return parsed.items;
  }

  if (Array.isArray(parsed.data?.tasks)) {
    return parsed.data.tasks;
  }

  if (Array.isArray(parsed.data?.items)) {
    return parsed.data.items;
  }

  return [];
};

const safeParseTasks = (rawOutput, kpiName) => {
  if (!rawOutput) {
    console.error("[generate-tasks] empty output payload, using fallback", { kpiName });
    return buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`);
  }

  try {
    const parsed = typeof rawOutput === "string" ? JSON.parse(rawOutput) : rawOutput;
    const taskItems = getTaskItemsFromParsedResponse(parsed);

    if (!Array.isArray(taskItems) || taskItems.length === 0) {
      console.error("[generate-tasks] tasks missing or empty, using fallback", { kpiName, rawOutput, parsed });
      return buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`);
    }

    const normalized = taskItems.slice(0, 3).map((task, index) => {
      try {
        return normalizeTaskItem(task ?? {}, index);
      } catch (taskError) {
        console.error("[generate-tasks] failed to normalize task item", { kpiName, index, task, taskError });
        return normalizeTaskItem({}, index);
      }
    });
    if (normalized.length >= 3) {
      return normalized;
    }
    return [...normalized, ...buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`).slice(0, 3 - normalized.length)];
  } catch (error) {
    console.error("[generate-tasks] json parse failed, using fallback", { kpiName, error, rawOutput });
    return buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`);
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return sendJson(res, 500, { error: "OPENAI_API_KEY is missing" });
  }

  const requestBody = getRequestBody(req);
  const kgiId = typeof requestBody?.kgiId === "string" ? requestBody.kgiId.trim() : "";
  const kgiName = typeof requestBody?.kgiName === "string" ? requestBody.kgiName.trim() : "";
  const goalDescription = typeof requestBody?.goalDescription === "string" ? requestBody.goalDescription.trim() : "";
  const kpiId = typeof requestBody?.kpiId === "string" ? requestBody.kpiId.trim() : "";
  const phaseId = typeof requestBody?.phaseId === "string" ? requestBody.phaseId.trim() : "";
  const roadmapPhases = Array.isArray(requestBody?.roadmapPhases) ? requestBody.roadmapPhases : [];
  const targetPhase = requestBody?.targetPhase && typeof requestBody.targetPhase === "object" ? requestBody.targetPhase : null;
  const allKpis = Array.isArray(requestBody?.allKpis) ? requestBody.allKpis : [];
  const targetKpi = requestBody?.targetKpi && typeof requestBody.targetKpi === "object" ? requestBody.targetKpi : null;
  const existingTasksForTargetKpi = Array.isArray(requestBody?.existingTasksForTargetKpi) ? requestBody.existingTasksForTargetKpi : [];
  const targetDate = typeof requestBody?.targetDate === "string" ? requestBody.targetDate.trim() : "";
  const phaseDeadline = typeof requestBody?.phaseDeadline === "string" ? requestBody.phaseDeadline.trim() : "";
  const kpiName = typeof targetKpi?.name === "string" ? targetKpi.name.trim() : "";
  const recentReflections = normalizeRecentReflections(requestBody?.recentReflections);
  const adaptationHints = buildAdaptationHints(recentReflections);

  if (!kgiName || !kpiName) {
    return sendJson(res, 400, {
      error: "Invalid request body. Expected JSON with kgiName, goalDescription, roadmapPhases, targetPhase, allKpis, targetKpi."
    });
  }

  try {
    const promptText = buildTaskPrompt({
      kgiName,
      goalDescription,
      roadmapPhases,
      targetPhase,
      allKpis,
      targetKpi,
      existingTasksForTargetKpi,
      targetDate,
      phaseDeadline,
      adaptationHints
    });
    console.log("[generate-tasks] request", {
      kgiId,
      kpiId,
      phaseId,
      kgiName,
      kpiName,
      allKpisCount: allKpis.length,
      existingTasksCount: existingTasksForTargetKpi.length,
      rawReflectionsCount: recentReflections.length,
      adaptationHintsCount: adaptationHints.length,
      promptChars: SYSTEM_PROMPT.length + promptText.length
    });
    const openAiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: SYSTEM_PROMPT }]
          },
          {
            role: "user",
            content: [{
              type: "input_text",
              text: promptText
            }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            ...TASK_RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text().catch(() => "");
      const normalizedErrorText = errorText.trim();
      console.error("[generate-tasks] OpenAI API request failed", {
        kgiId,
        kpiId,
        phaseId,
        status: openAiResponse.status,
        statusText: openAiResponse.statusText,
        body: normalizedErrorText
      });
      console.log("[generate-tasks] response", { success: false, status: openAiResponse.status });
      return sendJson(res, 502, {
        error: normalizedErrorText
          ? `OpenAI API request failed: ${normalizedErrorText}`
          : "OpenAI API request failed"
      });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);
    const structuredOutput = extractStructuredOutput(responseData);
    const tasks = safeParseTasks(structuredOutput ?? outputText, kpiName);

    console.log("[generate-tasks] response", {
      success: true,
      kgiId,
      kpiId,
      phaseId,
      taskCount: tasks.length,
      usedStructuredOutput: Boolean(structuredOutput),
      fallbackUsed: (!structuredOutput && !outputText) || tasks.some((task) => task.priority === 0)
    });
    return sendJson(res, 200, { tasks });
  } catch (error) {
    console.log("[generate-tasks] response", { success: false });
    console.error("[generate-tasks] Unexpected server error", error);
    return sendJson(res, 500, { error: "Unexpected server error" });
  }
};
