import { NextResponse } from "next/server";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはプロジェクト管理の専門家です。KGI/KPIに直結する実行可能なTaskを日本語JSONのみで返してください。`;

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
          required: ["title", "description", "type", "progressValue", "priority"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
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
  recentReflections?: RecentReflection[];
};

type TaskItem = {
  title: string;
  description: string;
  type: "one_time";
  progressValue: 1;
  priority: number;
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
  adaptationHints
}: {
  kgiName: string;
  kgiGoalText: string;
  kpiName: string;
  kpiDescription: string;
  kpiType: "result" | "action";
  targetValue: number;
  adaptationHints: string[];
}) => JSON.stringify({
  kgi: {
    name: kgiName,
    goal: kgiGoalText || "未設定"
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
    priorityRange: [1, 3]
  }
});

const isValidTask = (value: any): value is TaskItem => (
  value
  && typeof value === "object"
  && isNonEmptyString(value.title)
  && isNonEmptyString(value.description)
  && value.type === "one_time"
  && Number(value.progressValue) === 1
  && Number.isInteger(Number(value.priority))
  && Number(value.priority) >= 1
  && Number(value.priority) <= 3
);

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
      adaptationHints
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

    if (!outputText) {
      return NextResponse.json({ error: "Failed to parse Task JSON" }, { status: 500 });
    }

    const parsed = JSON.parse(outputText) as { tasks?: TaskItem[] };

    if (!Array.isArray(parsed.tasks) || parsed.tasks.length < 3 || parsed.tasks.length > 7 || !parsed.tasks.every(isValidTask)) {
      return NextResponse.json({ error: "Failed to parse Task JSON" }, { status: 500 });
    }

    const tasks = parsed.tasks.map((task) => ({
      title: task.title.trim(),
      description: task.description.trim(),
      type: "one_time" as const,
      progressValue: 1 as const,
      priority: Number(task.priority)
    }));

    console.log("[generate-tasks] response", { success: true, taskCount: tasks.length });
    return NextResponse.json({ tasks });
  } catch (error) {
    console.log("[generate-tasks] response", { success: false });
    console.error("[app/api/generate-tasks] Unexpected server error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
