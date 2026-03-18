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

type RequestBody = {
  taskTitle?: unknown;
  taskDescription?: unknown;
  kpiName?: unknown;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

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

const sanitizeSteps = (steps: unknown) => {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((step) => typeof step === "string" ? step.trim() : "")
    .filter((step) => step.length > 0)
    .slice(0, 3);
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

  if (!isNonEmptyString(taskTitle) || !isNonEmptyString(kpiName)) {
    return Response.json({
      error: "Invalid request body. Expected JSON with taskTitle, taskDescription, kpiName."
    }, { status: 400 });
  }

  try {
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
              text: [
                `KPI名: ${kpiName}`,
                `Task名: ${taskTitle}`,
                `Task補足説明: ${taskDescription || "未設定"}`,
                "このTaskに今すぐ着手できる小ステップを1〜3件、JSONでのみ返してください。"
              ].join("\n")
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
      return Response.json({ error: "OpenAI API request failed" }, { status: 502 });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);

    if (!outputText) {
      return Response.json({ error: "Failed to parse next action step JSON" }, { status: 500 });
    }

    const parsedResponse = JSON.parse(outputText);
    const steps = sanitizeSteps(parsedResponse?.steps);

    if (steps.length === 0 || steps.length > 3) {
      return Response.json({ error: "Failed to parse next action step JSON" }, { status: 500 });
    }

    return Response.json({ steps });
  } catch (error) {
    console.error("[generate-next-action-steps] Unexpected server error", error);
    return Response.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
