import { NextResponse } from "next/server";

type KpiItem = {
  title: string;
  description: string;
  targetValue: number;
};

type SubKgiCandidate = {
  title: string;
  description: string;
};

type GenerateKpisResponse = {
  resultKpis: KpiItem[];
  actionKpis: KpiItem[];
  subKgiCandidates: SubKgiCandidate[];
};

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはKPI設計の専門家です。
与えられた目標を、測定可能なKPI候補に分解してください。

ルール:
- KPIは「測れる指標」にする
- 結果を測るものは resultKpis
- 行動量・頻度を測るものは actionKpis
- 単体で大きな別プロジェクトになる目標は subKgiCandidates に分類する
- KGIをそのまま言い換えただけの項目は作らない
- 出力は必ず JSON のみ
- 日本語で返す
- resultKpis は 2〜4件
- actionKpis は 2〜4件
- subKgiCandidates は 0〜3件
- targetValue は現実的な整数にする`;

const KPI_RESPONSE_SCHEMA = {
  name: "generate_kpis_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["resultKpis", "actionKpis", "subKgiCandidates"],
    properties: {
      resultKpis: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "targetValue"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            targetValue: { type: "integer" }
          }
        }
      },
      actionKpis: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "targetValue"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            targetValue: { type: "integer" }
          }
        }
      },
      subKgiCandidates: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description"],
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          }
        }
      }
    }
  }
} as const;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isValidKpiItem = (value: unknown): value is KpiItem => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { title, description, targetValue } = value as Record<string, unknown>;

  return (
    isNonEmptyString(title) &&
    isNonEmptyString(description) &&
    typeof targetValue === "number" &&
    Number.isInteger(targetValue) &&
    Number.isFinite(targetValue)
  );
};

const isValidSubKgiCandidate = (value: unknown): value is SubKgiCandidate => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { title, description } = value as Record<string, unknown>;

  return isNonEmptyString(title) && isNonEmptyString(description);
};

const isValidGenerateKpisResponse = (
  value: unknown
): value is GenerateKpisResponse => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { resultKpis, actionKpis, subKgiCandidates } = value as Record<
    string,
    unknown
  >;

  if (!Array.isArray(resultKpis) || !Array.isArray(actionKpis) || !Array.isArray(subKgiCandidates)) {
    return false;
  }

  if (resultKpis.length < 2 || resultKpis.length > 4) {
    return false;
  }

  if (actionKpis.length < 2 || actionKpis.length > 4) {
    return false;
  }

  if (subKgiCandidates.length > 3) {
    return false;
  }

  return (
    resultKpis.every(isValidKpiItem) &&
    actionKpis.every(isValidKpiItem) &&
    subKgiCandidates.every(isValidSubKgiCandidate)
  );
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 }
    );
  }

  const requestBody = await request.json().catch(() => null);
  const goal = typeof requestBody?.goal === "string" ? requestBody.goal.trim() : "";

  if (!goal) {
    return NextResponse.json(
      { error: 'Invalid request body. Expected JSON: { "goal": "string" }.' },
      { status: 400 }
    );
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
            content: [
              {
                type: "input_text",
                text: `目標: ${goal}\n\n指定のJSONスキーマに厳密に従って、KPI候補だけを返してください。`
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            ...KPI_RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      return NextResponse.json(
        { error: "Failed to generate KPI candidates." },
        { status: 500 }
      );
    }

    const responseData = (await openAiResponse.json()) as {
      output_text?: unknown;
    };

    if (typeof responseData.output_text !== "string" || responseData.output_text.trim().length === 0) {
      return NextResponse.json(
        { error: "Failed to parse OpenAI response as JSON." },
        { status: 500 }
      );
    }

    let parsedResponse: unknown;

    try {
      parsedResponse = JSON.parse(responseData.output_text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse OpenAI response as JSON." },
        { status: 500 }
      );
    }

    if (!isValidGenerateKpisResponse(parsedResponse)) {
      return NextResponse.json(
        { error: "OpenAI response did not match the expected schema." },
        { status: 500 }
      );
    }

    return NextResponse.json(parsedResponse, { status: 200 });
  } catch (error) {
    console.error("generate-kpis route error", error);

    return NextResponse.json(
      { error: "Failed to generate KPI candidates." },
      { status: 500 }
    );
  }
}
