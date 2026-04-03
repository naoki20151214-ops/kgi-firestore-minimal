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
  name: "kgi_interview_outcome",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["genreClassification", "aiKgiSourceData", "kgiStatement", "kgiSuccessCriteria", "gapAnalysis", "kpiDrafts", "clarifiedSuccessState", "interviewNotes"],
    properties: {
      genreClassification: { type: "object", additionalProperties: true },
      aiKgiSourceData: { type: "object", additionalProperties: true },
      kgiStatement: { type: "string" },
      kgiSuccessCriteria: { type: "array", items: { type: "string" } },
      clarifiedSuccessState: { type: "string" },
      gapAnalysis: { type: "object", additionalProperties: true },
      kpiDrafts: { type: "array", items: { type: "string" } },
      interviewNotes: { type: "array", items: { type: "string" } }
    }
  }
} as const;

const SYSTEM_PROMPT = [
  "あなたはKGI作成のAI面談担当。入力と追加質問回答から、仕様書準拠で結果を一括生成してください。",
  "順番は必ず KGI -> 差分整理 -> KPI。",
  "KGIは期限内で完結判定できる成果状態のみ。期限をまたぐ条件は excludedFromCurrentKgi と nextKgiSuggestion に分離。",
  "自由入力をそのまま貼り付けず、人間が読んで具体像が分かる表現にする。",
  "FX/投資文脈では公開・読者・流入前提を混ぜない。",
  "sourceDataNarrative は短い箇条書き文字列で必須。",
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
    if (!response.ok || !data?.kgiStatement || !data?.aiKgiSourceData) return NextResponse.json({ error: "OpenAI API request failed", details: responseJson }, { status: response.status || 502 });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Unexpected server error", details: (error as Error)?.message || "unknown" }, { status: 500 });
  }
}
