const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはタスクを実行するための「今すぐやる小ステップ」を生成するAIです。

制約:
- 必ず3〜5個のステップを出す
- 各ステップは1行で具体的に書く
- 抽象表現は禁止
- 実行可能な行動のみ
- JSONのみ出力する
- 空は禁止

出力形式:
{
  "steps": [
    "ステップ1",
    "ステップ2",
    "ステップ3"
  ]
}`;

const STEP_RESPONSE_SCHEMA = {
  name: "generate_next_action_steps_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["steps"],
    properties: {
      steps: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "string"
        }
      }
    }
  }
};

type ReflectionResult = "as_planned" | "harder_than_expected" | "needs_improvement" | "could_not_do";

type RecentReflection = {
  taskTitle?: unknown;
  result?: unknown;
  comment?: unknown;
};

type RequestBody = {
  taskTitle?: unknown;
  taskDescription?: unknown;
  kpiName?: unknown;
  recentReflections?: RecentReflection[];
};

type NormalizedReflection = {
  taskTitle: string;
  result: ReflectionResult;
  comment: string;
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

const buildStepPrompt = ({
  kpiName,
  taskTitle,
  taskDescription,
  adaptationHints
}: {
  kpiName: string;
  taskTitle: string;
  taskDescription: string;
  adaptationHints: string[];
}) => JSON.stringify({
  kpiName,
  task: {
    title: taskTitle,
    description: taskDescription || "未設定"
  },
  adaptationHints,
  output: {
    steps: "3-5件",
    language: "ja",
    duration: "5-15分",
    style: "短く具体的"
  }
});

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

const FALLBACK_STEPS = [
  "タスク内容を読み直す",
  "必要な作業を3つに分解する",
  "最初の1つをすぐ実行する"
] as const;

const removeJsonCodeFence = (value: string) => value.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

const extractJsonObjectString = (value: string) => {
  const sanitized = removeJsonCodeFence(value);
  const firstBraceIndex = sanitized.indexOf("{");
  const lastBraceIndex = sanitized.lastIndexOf("}");

  if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex < firstBraceIndex) {
    return "";
  }

  return sanitized.slice(firstBraceIndex, lastBraceIndex + 1);
};

const getFallbackSteps = (reason: string) => {
  console.warn("[generate-next-action-steps] using fallback steps", { reason, fallbackSteps: FALLBACK_STEPS });
  return FALLBACK_STEPS.slice();
};

const sanitizeSteps = (steps: unknown) => {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((step) => typeof step === "string" ? step.trim() : "")
    .filter((step) => step.length > 0)
    .slice(0, 5);
};

const parseStepsFromOutputText = (outputText: string) => {
  console.log("[generate-next-action-steps] raw AI response", outputText);

  if (!outputText || !outputText.trim()) {
    return getFallbackSteps("empty_response");
  }

  const jsonText = extractJsonObjectString(outputText);

  if (!jsonText) {
    return getFallbackSteps("json_not_found");
  }

  try {
    const parsedResponse = JSON.parse(jsonText) as { steps?: unknown };
    const steps = sanitizeSteps(parsedResponse?.steps);

    if (steps.length < 3) {
      return getFallbackSteps("steps_missing_or_too_short");
    }

    return steps;
  } catch (error) {
    console.error("[generate-next-action-steps] parse error", error);
    return getFallbackSteps("json_parse_error");
  }
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }

  let requestBody: RequestBody;

  try {
    requestBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const taskTitle = typeof requestBody?.taskTitle === "string" ? requestBody.taskTitle.trim() : "";
  const taskDescription = typeof requestBody?.taskDescription === "string" ? requestBody.taskDescription.trim() : "";
  const kpiName = typeof requestBody?.kpiName === "string" ? requestBody.kpiName.trim() : "";
  const recentReflections = normalizeRecentReflections(requestBody?.recentReflections);
  const adaptationHints = buildAdaptationHints(recentReflections);

  if (!isNonEmptyString(taskTitle) || !isNonEmptyString(kpiName)) {
    return Response.json({
      error: "Invalid request body. Expected JSON with taskTitle, taskDescription, kpiName."
    }, { status: 400 });
  }

  try {
    const promptText = buildStepPrompt({
      kpiName,
      taskTitle,
      taskDescription,
      adaptationHints
    });
    console.log("[generate-next-action-steps] request", { rawReflectionsCount: recentReflections.length, adaptationHintsCount: adaptationHints.length, promptChars: SYSTEM_PROMPT.length + promptText.length });
    const openAiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        prompt_cache_key: `generate-next-action-steps:${kpiName}:${taskTitle}`,
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
            ...STEP_RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      console.log("[generate-next-action-steps] response", { success: false, status: openAiResponse.status });
      return Response.json({ error: "OpenAI API request failed" }, { status: 502 });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);
    const steps = parseStepsFromOutputText(outputText);

    console.log("[generate-next-action-steps] response", { success: true, stepCount: steps.length, usedFallback: steps.every((step, index) => step === FALLBACK_STEPS[index]) });
    return Response.json({ steps });
  } catch (error) {
    console.log("[generate-next-action-steps] response", { success: false });
    console.error("[generate-next-action-steps] Unexpected server error", error);
    return Response.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
