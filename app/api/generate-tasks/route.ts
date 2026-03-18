import { NextResponse } from "next/server";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはプロジェクト管理と実行分解の専門家です。
与えられたKGIとKPIから、そのKPIを前に進めるための具体的で実行可能なTaskだけを作成してください。

ルール:
- Taskは行動レベルまで分解する
- 曖昧な表現を避ける
- 大きすぎる目標ではなく、1回で着手できる単位にする
- KPI達成と因果関係のあるTaskにする
- 3〜7件出す
- 日本語で返す
- 出力は必ずJSONのみ
- 各Taskは以下の形式:
  {
    "title": "...",
    "description": "...",
    "type": "one_time",
    "progressValue": 1,
    "priority": 1
  }`;

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

type TaskRequest = {
  kgiName?: string;
  kgiGoalText?: string;
  kpiName?: string;
  kpiDescription?: string;
  kpiType?: "result" | "action";
  targetValue?: number;
};

type TaskItem = {
  title: string;
  description: string;
  type: "one_time";
  progressValue: 1;
  priority: number;
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

  if (!kgiName || !kpiName || (kpiType !== "result" && kpiType !== "action") || !Number.isFinite(targetValue)) {
    return NextResponse.json({
      error: "Invalid request body. Expected JSON with kgiName, kgiGoalText, kpiName, kpiDescription, kpiType, targetValue."
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
                `KGI名: ${kgiName}`,
                `KGIゴール説明: ${kgiGoalText || "未設定"}`,
                `KPI名: ${kpiName}`,
                `KPI説明: ${kpiDescription || "未設定"}`,
                `KPIタイプ: ${kpiType}`,
                `KPI目標値: ${targetValue}`,
                "指定のJSONスキーマに厳密に従ってTask候補のみ返してください。"
              ].join("\n")
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

    return NextResponse.json({
      tasks: parsed.tasks.map((task) => ({
        title: task.title.trim(),
        description: task.description.trim(),
        type: "one_time" as const,
        progressValue: 1 as const,
        priority: Number(task.priority)
      }))
    });
  } catch (error) {
    console.error("[app/api/generate-tasks] Unexpected server error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
