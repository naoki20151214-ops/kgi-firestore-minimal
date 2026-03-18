import { NextResponse } from "next/server";

type Kpi = {
  title: string;
  type: "action" | "result";
  description: string;
  targetValue: number;
};

type GenerateKpisResponse = {
  kpis: Kpi[];
};

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const SYSTEM_PROMPT = `You are a KPI design expert.
Break down goals into measurable KPIs only.
Never create sub-goals.
Always output clean JSON.`;

const KPI_SCHEMA = {
  name: "generated_kpis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kpis"],
    properties: {
      kpis: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "type", "description", "targetValue"],
          properties: {
            title: { type: "string" },
            type: { type: "string", enum: ["action", "result"] },
            description: { type: "string" },
            targetValue: { type: "number" }
          }
        }
      }
    }
  }
} as const;

const isValidKpiPayload = (value: unknown): value is GenerateKpisResponse => {
  if (!value || typeof value !== "object" || !("kpis" in value) || !Array.isArray(value.kpis)) {
    return false;
  }

  if (value.kpis.length < 3 || value.kpis.length > 5) {
    return false;
  }

  let hasAction = false;
  let hasResult = false;

  for (const kpi of value.kpis) {
    if (!kpi || typeof kpi !== "object") {
      return false;
    }

    const { title, type, description, targetValue } = kpi as Record<string, unknown>;

    if (typeof title !== "string" || typeof description !== "string") {
      return false;
    }

    if (type !== "action" && type !== "result") {
      return false;
    }

    if (typeof targetValue !== "number" || Number.isNaN(targetValue) || !Number.isFinite(targetValue)) {
      return false;
    }

    if (type === "action") hasAction = true;
    if (type === "result") hasResult = true;
  }

  return hasAction && hasResult;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const goal = typeof body?.goal === "string" ? body.goal.trim() : "";

    if (!goal) {
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON: { "goal": "string" }.' },
        { status: 400 }
      );
    }

    const openAiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        temperature: 0.7,
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
                text: [
                  "Create 3 to 5 KPIs for the following goal.",
                  "Requirements:",
                  "- Break down the goal into measurable KPIs only.",
                  "- Do not create sub-goals or nested KGI.",
                  "- Include both action KPIs and result KPIs.",
                  "- action KPIs should represent daily or weekly behaviors.",
                  "- result KPIs should represent numeric outcomes.",
                  "- Return only valid JSON with the exact schema.",
                  `Goal: ${goal}`
                ].join("\n")
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            ...KPI_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      return NextResponse.json(
        { error: "Failed to generate KPIs.", details: errorText },
        { status: 502 }
      );
    }

    const responseData = await openAiResponse.json();
    const outputText = responseData.output_text;

    if (typeof outputText !== "string") {
      return NextResponse.json(
        { error: "OpenAI response did not contain JSON output." },
        { status: 502 }
      );
    }

    const parsed = JSON.parse(outputText) as unknown;

    if (!isValidKpiPayload(parsed)) {
      return NextResponse.json(
        { error: "OpenAI response did not match the expected KPI schema." },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("generate-kpis route error", error);

    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
