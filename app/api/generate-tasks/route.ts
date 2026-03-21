import { NextResponse } from "next/server";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはPDCAアプリのTask生成AIです。KPIから必ずユーザーがすぐ動けるTaskを日本語JSONのみで返してください。

最重要ルール:
- KPIごとに最低1つは「Next Action」としてそのまま使えるTaskを含める
- 先頭のTaskは5分以内に着手できる、1ステップで完結する具体行動にする
- 抽象表現は禁止（例: 調査する、戦略を考える）
- 良い例: 競合記事を3つ開く / 読者候補1人にDM送る / noteのタイトルを1つ書く
- titleは短い行動文、descriptionは1行の補足説明にする
- stage は必ず setup / research / decision / build / launch / review のいずれか1つを入れる
- TaskはすべてKPIに直接つながる内容だけにする`;

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
        maxItems: 7,
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
} as const;

type ReflectionResult = "as_planned" | "harder_than_expected" | "needs_improvement" | "could_not_do";

type RecentReflection = {
  taskTitle?: unknown;
  result?: unknown;
  comment?: unknown;
};

type TaskRequest = {
  kgiName?: string;
  kgiGoalText?: string;
  kpiName?: string;
  kpiDescription?: string;
  kpiType?: "result" | "action";
  targetValue?: number;
  phaseName?: string;
  recentReflections?: RecentReflection[];
};

type TaskStage = "setup" | "research" | "decision" | "build" | "launch" | "review";

type TaskItem = {
  title?: unknown;
  text?: unknown;
  kpi?: unknown;
  description?: unknown;
  stage?: unknown;
  type?: unknown;
  progressValue?: unknown;
  priority?: unknown;
  status?: unknown;
  dependsOnTaskIds?: unknown;
};

type NormalizedTask = {
  title: string;
  description: string;
  stage: TaskStage;
  type: "one_time";
  progressValue: 1;
  priority: number;
  status: "todo";
  dependsOnTaskIds: string[];
};

type NormalizedReflection = {
  taskTitle: string;
  result: ReflectionResult;
  comment: string;
};

const extractOutputText = (responseData: any) => {
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

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isValidReflectionResult = (value: unknown): value is ReflectionResult => (
  value === "as_planned"
  || value === "harder_than_expected"
  || value === "needs_improvement"
  || value === "could_not_do"
);

const normalizeRecentReflections = (value: unknown): NormalizedReflection[] => {
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
    .filter((item): item is NormalizedReflection => Boolean(item))
    .slice(0, 5);
};

const COMMENT_DIFFICULTY_KEYWORDS = ["難しい", "分からない", "わからない", "専門用語", "大変"];
const MAX_ADAPTATION_HINTS = 5;

const isCommentDifficult = (comment: string) => COMMENT_DIFFICULTY_KEYWORDS.some((keyword) => comment.includes(keyword));

const buildAdaptationHints = (recentReflections: NormalizedReflection[]) => {
  const hintSet = new Set<string>();

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
  kgiGoalText,
  kpiName,
  kpiDescription,
  kpiType,
  targetValue,
  adaptationHints,
  phaseName
}: {
  kgiName: string;
  kgiGoalText: string;
  kpiName: string;
  kpiDescription: string;
  kpiType: "result" | "action";
  targetValue: number;
  adaptationHints: string[];
  phaseName: string;
}) => JSON.stringify({
  kgi: {
    name: kgiName,
    goal: kgiGoalText || "未設定"
  },
  roadmap: {
    phaseName: phaseName || "未分類"
  },
  kpi: {
    name: kpiName,
    description: kpiDescription || "未設定",
    type: kpiType,
    targetValue
  },
  adaptationHints,
  output: {
    tasks: "3-7件",
    language: "ja",
    type: "one_time",
    progressValue: 1,
    priorityRange: [1, 3],
    stageRule: "Every task must include one valid stage. If unsure, use build.",
    firstTaskRule: "The first task must be usable as the immediate Next Action.",
    descriptionRule: "Each description must explain the concrete action in one line."
  }
});

const TASK_STAGES: TaskStage[] = ["setup", "research", "decision", "build", "launch", "review"];
const normalizeTaskStage = (stage: unknown): TaskStage => {
  const normalized = typeof stage === "string" ? stage.trim().toLowerCase() : "";
  return TASK_STAGES.includes(normalized as TaskStage) ? normalized as TaskStage : "build";
};

const FALLBACK_TASK_TITLE = "最初の一歩を決める";
const FALLBACK_TASK_DESCRIPTION = "KPI達成に向けて、最初に着手する具体的な作業を1つ決めて実行する。";

const normalizeTaskTitle = (value: unknown, index: number, fallbacks: unknown[] = []) => {
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

const normalizeTaskDescription = (value: unknown, title: string) => {
  if (isNonEmptyString(value)) {
    return value.trim();
  }

  return `${title} を安全に進めるための補完Taskです。`;
};

const normalizeTaskPriority = (value: unknown) => {
  const priority = Number(value);

  if (!Number.isFinite(priority) || priority < 0) {
    return 0;
  }

  if (priority > 3) {
    return 3;
  }

  return Math.trunc(priority);
};

const normalizeDependsOnTaskIds = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const normalizeTaskItem = (value: TaskItem, index: number): NormalizedTask => {
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

const buildFallbackTasks = (taskTitle = FALLBACK_TASK_TITLE): NormalizedTask[] => [{
  title: isNonEmptyString(taskTitle) ? taskTitle.trim() : FALLBACK_TASK_TITLE,
  description: FALLBACK_TASK_DESCRIPTION,
  stage: "build",
  type: "one_time",
  progressValue: 1,
  priority: 0,
  status: "todo",
  dependsOnTaskIds: []
}];

const getTaskItemsFromParsedResponse = (parsed: unknown): TaskItem[] => {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const record = parsed as {
    tasks?: unknown;
    items?: unknown;
    data?: { tasks?: unknown; items?: unknown };
  };

  if (Array.isArray(record.tasks)) {
    return record.tasks;
  }

  if (Array.isArray(record.items)) {
    return record.items;
  }

  if (Array.isArray(record.data?.tasks)) {
    return record.data.tasks;
  }

  if (Array.isArray(record.data?.items)) {
    return record.data.items;
  }

  return [];
};

const safeParseTasks = (outputText: string, kpiName: string) => {
  if (!outputText) {
    console.error("[generate-tasks] empty outputText, using fallback", { kpiName });
    return buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`);
  }

  try {
    const parsed = JSON.parse(outputText) as unknown;
    const taskItems = getTaskItemsFromParsedResponse(parsed);

    if (!Array.isArray(taskItems) || taskItems.length === 0) {
      console.error("[generate-tasks] tasks missing or empty, using fallback", { kpiName, outputText, parsed });
      return buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`);
    }

    return taskItems.slice(0, 7).map((task, index) => {
      try {
        return normalizeTaskItem(task ?? {}, index);
      } catch (taskError) {
        console.error("[generate-tasks] failed to normalize task item", { kpiName, index, task, taskError });
        return normalizeTaskItem({}, index);
      }
    });
  } catch (error) {
    console.error("[generate-tasks] json parse failed, using fallback", { kpiName, error, outputText });
    return buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`);
  }
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as TaskRequest | null;
  const kgiName = typeof body?.kgiName === "string" ? body.kgiName.trim() : "";
  const kgiGoalText = typeof body?.kgiGoalText === "string" ? body.kgiGoalText.trim() : "";
  const kpiName = typeof body?.kpiName === "string" ? body.kpiName.trim() : "";
  const kpiDescription = typeof body?.kpiDescription === "string" ? body.kpiDescription.trim() : "";
  const kpiType = body?.kpiType;
  const targetValue = Number(body?.targetValue);
  const phaseName = typeof body?.phaseName === "string" ? body.phaseName.trim() : "";
  const recentReflections = normalizeRecentReflections(body?.recentReflections);
  const adaptationHints = buildAdaptationHints(recentReflections);

  if (!kgiName || !kpiName || (kpiType !== "result" && kpiType !== "action") || !Number.isFinite(targetValue)) {
    return NextResponse.json({
      error: "Invalid request body. Expected JSON with kgiName, kgiGoalText, kpiName, kpiDescription, kpiType, targetValue."
    }, { status: 400 });
  }

  try {
    const promptText = buildTaskPrompt({
      kgiName,
      kgiGoalText,
      kpiName,
      kpiDescription,
      kpiType,
      targetValue,
      adaptationHints,
      phaseName
    });
    console.log("[generate-tasks] request", { rawReflectionsCount: recentReflections.length, adaptationHintsCount: adaptationHints.length, promptChars: SYSTEM_PROMPT.length + promptText.length });
    const openAiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        prompt_cache_key: `generate-tasks:${kgiName}:${kpiName}:${kpiType}:${targetValue}`,
        prompt_cache_retention: "24h",
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
      console.log("[generate-tasks] response", { success: false, status: openAiResponse.status });
      return NextResponse.json({ error: "OpenAI API request failed" }, { status: 502 });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);

    const tasks = safeParseTasks(outputText, kpiName);

    console.log("[generate-tasks] response", { success: true, taskCount: tasks.length, fallbackUsed: !outputText || tasks.some((task) => task.priority === 0) });
    return NextResponse.json({ tasks });
  } catch (error) {
    console.log("[generate-tasks] response", { success: false });
    console.error("[app/api/generate-tasks] Unexpected server error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
