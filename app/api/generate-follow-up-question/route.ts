import { NextResponse } from "next/server";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const extractOutputText = (responseData: any) => {
  if (typeof responseData?.output_text === "string" && responseData.output_text.trim()) return responseData.output_text.trim();
  if (!Array.isArray(responseData?.output)) return "";
  for (const outputItem of responseData.output) {
    if (!Array.isArray(outputItem?.content)) continue;
    for (const contentItem of outputItem.content) {
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) return contentItem.text.trim();
    }
  }
  return "";
};

const RESPONSE_SCHEMA = {
  name: "kgi_follow_up_question",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["slot", "question_text", "help_text", "options", "allow_other_text"],
    properties: {
      slot: { type: "string" },
      question_text: { type: "string" },
      help_text: { type: "string" },
      options: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label"],
          properties: {
            id: { type: "string" },
            label: { type: "string" }
          }
        }
      },
      allow_other_text: { type: "boolean" }
    }
  }
} as const;

const SYSTEM_PROMPT = [
  "あなたはKGI作成ウィザードの追加質問を1問だけ生成するアシスタントです。",
  "固定なのはslotのみ。question_textとoptionsは毎回ユーザー文脈に合わせて調整すること。",
  "質問は1問1論点。日本語は自然かつ短く、抽象語だけの質問は禁止。",
  "選択肢は3〜5個。答えやすい具体表現を使い、文脈に合わない選択肢は出さないこと。",
  "必要な時のみotherを追加してよい。allow_other_textはotherを含む場合のみtrue推奨。",
  "FX/投資文脈で、発信前提（ブログ運営など）の選択肢を機械的に混ぜないこと。",
  "返答は必ずJSONのみ。"
].join("\n");

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.slot !== "string") {
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
