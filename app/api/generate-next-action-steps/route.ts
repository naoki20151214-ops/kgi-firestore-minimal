const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたは実行支援の専門家です。
与えられたタスクを、今すぐ始められる小ステップに分解してください。

ルール:
- 1〜3件
- それぞれ短く、具体的に
- 5〜15分で着手できる行動にする
- 曖昧な表現は禁止
- 出力は JSON のみ
- 日本語で返す`;

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
        minItems: 1,
        maxItems: 3,
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

type StepParseResult = {
  steps: string[];
  usedFallback: boolean;
  reason: string;
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
}) => [
  `KPI名: ${kpiName}`,
  `Task名: ${taskTitle}`,
  `Task補足説明: ${taskDescription || "未設定"}`,
  adaptationHints.length > 0
    ? `振り返り反映ヒント: ${adaptationHints.join(" / ")}`
    : "",
  "このTaskに今すぐ着手できる小ステップを1〜3件、JSONでのみ返してください。"
].filter(Boolean).join("\n");

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
  "必要な作業を3つに分ける",
  "最初の1つをすぐ始める"
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

const sanitizeSteps = (steps: unknown) => {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((step) => typeof step === "string" ? step.trim() : "")
    .filter((step) => step.length > 0)
    .slice(0, 3);
};

const isSameStepSet = (steps: string[]) => steps.length === FALLBACK_STEPS.length && steps.every((step, index) => step === FALLBACK_STEPS[index]);

const getFallbackResult = (reason: string): StepParseResult => {
  console.warn("[generate-next-action-steps] fallback enabled", {
    endpoint: "generate-next-action-steps",
    reason,
    usedFallback: true,
    returnedStepsCount: FALLBACK_STEPS.length
  });

  return {
    steps: FALLBACK_STEPS.slice(),
    usedFallback: true,
    reason
  };
};

const parseStepsFromOutputText = (outputText: string): StepParseResult => {
  console.log("[generate-next-action-steps] raw response status", {
    endpoint: "generate-next-action-steps",
    hasRawResponse: Boolean(outputText && outputText.trim())
  });

  if (!outputText || !outputText.trim()) {
    console.log("[generate-next-action-steps] parse result", { endpoint: "generate-next-action-steps", parseSucceeded: false, reason: "empty_response" });
    return getFallbackResult("empty_response");
  }

  const jsonText = extractJsonObjectString(outputText);

  if (!jsonText) {
    console.log("[generate-next-action-steps] parse result", { endpoint: "generate-next-action-steps", parseSucceeded: false, reason: "json_not_found" });
    return getFallbackResult("json_not_found");
  }

  try {
    const parsedResponse = JSON.parse(jsonText) as { steps?: unknown };
    const steps = sanitizeSteps(parsedResponse?.steps);

    if (steps.length === 0) {
      console.log("[generate-next-action-steps] parse result", { endpoint: "generate-next-action-steps", parseSucceeded: false, reason: "steps_missing_or_empty" });
      return getFallbackResult("steps_missing_or_empty");
    }

    console.log("[generate-next-action-steps] parse result", { endpoint: "generate-next-action-steps", parseSucceeded: true, reason: "ok" });
    return {
      steps,
      usedFallback: isSameStepSet(steps),
      reason: "ok"
    };
  } catch (error) {
    console.error("[generate-next-action-steps] parse error", {
      endpoint: "generate-next-action-steps",
      parseSucceeded: false,
      reason: "json_parse_error",
      error
    });
    return getFallbackResult("json_parse_error");
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
    console.log("[generate-next-action-steps] request", {
      endpoint: "generate-next-action-steps",
      rawInputPayload: {
        taskTitle,
        taskDescription,
        kpiName,
        recentReflections
      },
      rawReflectionsCount: recentReflections.length,
      adaptationHints,
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
            ...STEP_RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      console.error("[generate-next-action-steps] upstream error", {
        endpoint: "generate-next-action-steps",
        status: openAiResponse.status,
        rawInputPayload: {
          taskTitle,
          taskDescription,
          kpiName,
          recentReflections
        }
      });
      const fallback = getFallbackResult(`upstream_status_${openAiResponse.status}`);
      console.log("[generate-next-action-steps] response", {
        endpoint: "generate-next-action-steps",
        parseSucceeded: false,
        usedFallback: fallback.usedFallback,
        returnedStepsCount: fallback.steps.length
      });
      return Response.json({ steps: fallback.steps });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);
    const parsed = parseStepsFromOutputText(outputText);

    console.log("[generate-next-action-steps] response", {
      endpoint: "generate-next-action-steps",
      parseSucceeded: parsed.reason === "ok",
      usedFallback: parsed.usedFallback,
      returnedStepsCount: parsed.steps.length
    });
    return Response.json({ steps: parsed.steps });
  } catch (error) {
    console.error("[generate-next-action-steps] unexpected error", {
      endpoint: "generate-next-action-steps",
      error
    });
    const fallback = getFallbackResult("unexpected_server_error");
    console.log("[generate-next-action-steps] response", {
      endpoint: "generate-next-action-steps",
      parseSucceeded: false,
      usedFallback: fallback.usedFallback,
      returnedStepsCount: fallback.steps.length
    });
    return Response.json({ steps: fallback.steps });
  }
}
