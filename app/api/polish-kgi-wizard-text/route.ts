import { NextResponse } from "next/server";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

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
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
        return contentItem.text.trim();
      }
    }
  }

  return "";
};

const RESPONSE_SCHEMA = {
  name: "kgi_wizard_writing",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["normalizedSummaryText", "feasibilityReasonText", "scopeAdjustmentText", "questionTexts", "candidateTexts"],
    properties: {
      normalizedSummaryText: { type: "string" },
      feasibilityReasonText: { type: "string" },
      scopeAdjustmentText: { type: "string" },
      questionTexts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "text"],
          properties: {
            id: { type: "string" },
            text: { type: "string" }
          }
        }
      },
      candidateTexts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "goalText", "reasonText", "concernText"],
          properties: {
            title: { type: "string" },
            goalText: { type: "string" },
            reasonText: { type: "string" },
            concernText: { type: "string" }
          }
        }
      }
    }
  }
} as const;

const SYSTEM_PROMPT = [
  "あなたはKGI作成ウィザードの文章仕上げ専用アシスタントです。",
  "役割は文章の自然化のみです。判断の骨組みは絶対に変更しないでください。",
  "新しい目標を勝手に発明しないこと。",
  "与えられた構造化データの意味を保ったまま、初心者向けに短くわかりやすい日本語へ整えてください。",
  "長すぎる説明は禁止。重複表現を避け、X/Instagram/YouTubeなど表記を統一してください。",
  "候補数は最大3件、質問は最大3件に収める。",
  "必ずJSONのみ返却。"
].join("\n");

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(body) }] }
        ],
        text: {
          format: {
            type: "json_schema",
            name: RESPONSE_SCHEMA.name,
            schema: RESPONSE_SCHEMA.schema,
            strict: RESPONSE_SCHEMA.strict
          }
        }
      })
    });

    const responseJson = await response.json();
    const outputText = extractOutputText(responseJson);
    const data = outputText ? JSON.parse(outputText) : null;

    if (!response.ok || !data) {
      return NextResponse.json({ error: "OpenAI API request failed", details: responseJson }, { status: response.status || 502 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Unexpected server error", details: (error as Error)?.message || "unknown" }, { status: 500 });
  }
}
