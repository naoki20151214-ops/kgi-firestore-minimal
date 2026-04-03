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
  name: "kgi_interview_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["genre_classification", "kgi_split_decision", "current_understanding", "quality_check", "draft_output", "next_question"],
    properties: {
      genre_classification: { type: "object", additionalProperties: false, required: ["genre", "reason"], properties: { genre: { type: "string" }, reason: { type: "string" } } },
      kgi_split_decision: {
        type: "object", additionalProperties: false, required: ["should_split", "reason", "current_kgi_scope", "next_kgi_candidate"],
        properties: { should_split: { type: "boolean" }, reason: { type: "string" }, current_kgi_scope: { type: "string" }, next_kgi_candidate: { type: "string" } }
      },
      current_understanding: {
        type: "object", additionalProperties: false,
        required: ["upper_goal", "current_kgi_scope", "concrete_deliverable", "audience_summary", "value_promise", "minimum_line", "hard_requirements", "excluded_from_current_kgi"],
        properties: {
          upper_goal: { type: "string" }, current_kgi_scope: { type: "string" }, concrete_deliverable: { type: "string" }, audience_summary: { type: "string" },
          value_promise: { type: "string" }, minimum_line: { type: "string" }, hard_requirements: { type: "array", items: { type: "string" } }, excluded_from_current_kgi: { type: "array", items: { type: "string" } }
        }
      },
      quality_check: {
        type: "object", additionalProperties: false, required: ["is_ready_for_display", "is_ready_for_save", "missing_points"],
        properties: {
          is_ready_for_display: { type: "boolean" }, is_ready_for_save: { type: "boolean" },
          missing_points: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "reason"], properties: { id: { type: "string" }, label: { type: "string" }, reason: { type: "string" } } } }
        }
      },
      draft_output: {
        type: "object", additionalProperties: false, required: ["kgi_statement", "kgi_success_criteria", "gap_analysis", "kpi_drafts"],
        properties: {
          kgi_statement: { type: "string" }, kgi_success_criteria: { type: "array", items: { type: "string" } },
          gap_analysis: {
            type: "object", additionalProperties: false, required: ["already_done", "not_done_yet", "first_big_mountain", "gap_to_fill"],
            properties: { already_done: { type: "array", items: { type: "string" } }, not_done_yet: { type: "array", items: { type: "string" } }, first_big_mountain: { type: "string" }, gap_to_fill: { type: "array", items: { type: "string" } } }
          },
          kpi_drafts: { type: "array", items: { type: "string" } }
        }
      },
      next_question: {
        type: "object", additionalProperties: false, required: ["should_ask", "slot", "question_text", "help_text", "options", "allow_other_text"],
        properties: {
          should_ask: { type: "boolean" }, slot: { type: "string" }, question_text: { type: "string" }, help_text: { type: "string" }, allow_other_text: { type: "boolean" },
          options: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string" }, label: { type: "string" }, recommended: { type: "boolean" }, reason: { type: "string" } } } }
        }
      }
    }
  }
} as const;

const SYSTEM_PROMPT = [
  "あなたはKGI作成のAI面談担当です。毎ターン、ジャンル判定から不足判定と次の1問まで一貫して返してください。",
  "必ずJSONスキーマ通りに返答すること。",
  "質問文は自然な日本語。翻訳調や固い言い回し（納品物、具体的成果を約束など）は避ける。",
  "Logic側テンプレを前提にせず、その時点の文脈だけから current_understanding と draft_output を更新する。",
  "is_ready_for_display と is_ready_for_save は厳密に分離する。",
  "不足があっても draft_output は返す。",
  "ジャンル混線を禁止。投資・トレード型では公開/読者系項目を出さない。",
  "商品販売型やサービス型でも、別ケースの文脈を混ぜない。",
  "KGIは期限内に判定可能な達成状態のみ。期限をまたぐ内容は next_kgi_candidate や excluded_from_current_kgi に分離する。",
  "JSON以外は返さない。"
].join("\n");

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(body) }] }
        ],
        text: { format: { type: "json_schema", name: RESPONSE_SCHEMA.name, schema: RESPONSE_SCHEMA.schema, strict: RESPONSE_SCHEMA.strict } }
      })
    });
    const responseJson = await response.json();
    const outputText = extractOutputText(responseJson);
    const data = outputText ? JSON.parse(outputText) : null;
    if (!response.ok || !data?.quality_check || !data?.next_question) return NextResponse.json({ error: "OpenAI API request failed", details: responseJson }, { status: response.status || 502 });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Unexpected server error", details: (error as Error)?.message || "unknown" }, { status: 500 });
  }
}
