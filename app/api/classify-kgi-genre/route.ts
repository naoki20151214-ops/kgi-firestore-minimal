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
  name: "kgi_genre_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["primaryGenre", "confidence", "reason", "multipleKgiDetected", "splitSuggestion", "suggestedSlots"],
    properties: {
      primaryGenre: { type: "string" },
      confidence: { type: "string" },
      reason: { type: "string" },
      multipleKgiDetected: { type: "boolean" },
      splitSuggestion: { type: "string" },
      suggestedSlots: { type: "array", items: { type: "string" } }
    }
  }
} as const;

const SYSTEM_PROMPT = [
  "あなたはKGI作成フローのジャンル判定担当です。",
  "入力から最初にジャンルを判定し、必要ならKGI分割提案を行ってください。",
  "候補ジャンル: 情報発信・メディア型, 商品販売型, サービス受注型, アプリ・ツール提供型, 投資・トレード型, 自己改善型, その他。",
  "FX/投資なら公開・読者前提の質問を推奨しないこと。",
  "suggestedSlots には次に聞くべき slot id を最大6個まで入れる。",
  "JSONのみ返す。"
].join("\n");

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  const body = await request.json().catch(() => null);
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(body || {}) }] }
        ],
        text: { format: { type: "json_schema", name: RESPONSE_SCHEMA.name, schema: RESPONSE_SCHEMA.schema, strict: RESPONSE_SCHEMA.strict } }
      })
    });
    const responseJson = await response.json();
    const outputText = extractOutputText(responseJson);
    const data = outputText ? JSON.parse(outputText) : null;
    if (!response.ok || !data?.primaryGenre) return NextResponse.json({ error: "OpenAI API request failed", details: responseJson }, { status: response.status || 502 });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Unexpected server error", details: (error as Error)?.message || "unknown" }, { status: 500 });
  }
}
