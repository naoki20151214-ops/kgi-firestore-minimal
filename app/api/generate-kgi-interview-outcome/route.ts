import { NextResponse } from "next/server";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5-mini";

const logPrefix = "[app/api/generate-kgi-interview-outcome]";

const logInfo = (message: string, detail: Record<string, unknown> = {}) => {
  console.log(`${logPrefix} ${message}`, detail);
};

const logError = (message: string, detail: Record<string, unknown> = {}) => {
  console.error(`${logPrefix} ${message}`, detail);
};

const truncateForLog = (value: string, maxLength = 1500) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...(truncated)`;
};

const deriveOpenAiHttpErrorCode = (status: number) => {
  const normalized = Number.isInteger(status) && status > 0 ? status : "unknown";
  return `openai_http_error_${normalized}`;
};

const normalizeDeadline = (value: unknown) => {
  const input = String(value || "").trim();
  if (!input) return "";
  const replaced = input.replace(/[/.]/g, "-").replace(/年/g, "-").replace(/月/g, "-").replace(/日/g, "");
  const match = replaced.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return input;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

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

const TURN_RESPONSE_SCHEMA = {
  name: "kgi_interview_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["genre_classification", "kgi_split_decision", "current_understanding", "quality_check", "draft_output", "next_question"],
    properties: {
      genre_classification: { type: "object", additionalProperties: false, required: ["genre", "reason"], properties: { genre: { type: "string" }, reason: { type: "string" } } },
      kgi_split_decision: { type: "object", additionalProperties: false, required: ["should_split", "reason", "current_kgi_scope", "next_kgi_candidate"], properties: { should_split: { type: "boolean" }, reason: { type: "string" }, current_kgi_scope: { type: "string" }, next_kgi_candidate: { type: "string" } } },
      current_understanding: { type: "object", additionalProperties: false, required: ["upper_goal", "current_kgi_scope", "concrete_deliverable", "audience_summary", "value_promise", "minimum_line", "hard_requirements", "excluded_from_current_kgi"], properties: { upper_goal: { type: "string" }, current_kgi_scope: { type: "string" }, concrete_deliverable: { type: "string" }, audience_summary: { type: "string" }, value_promise: { type: "string" }, minimum_line: { type: "string" }, hard_requirements: { type: "array", items: { type: "string" } }, excluded_from_current_kgi: { type: "array", items: { type: "string" } } } },
      quality_check: { type: "object", additionalProperties: false, required: ["is_ready_for_display", "is_ready_for_save", "missing_points"], properties: { is_ready_for_display: { type: "boolean" }, is_ready_for_save: { type: "boolean" }, missing_points: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "reason"], properties: { id: { type: "string" }, label: { type: "string" }, reason: { type: "string" } } } } } },
      draft_output: { type: "object", additionalProperties: false, required: ["kgi_statement", "kgi_success_criteria", "gap_analysis", "kpi_drafts"], properties: { kgi_statement: { type: "string" }, kgi_success_criteria: { type: "array", items: { type: "string" } }, gap_analysis: { type: "object", additionalProperties: false, required: ["already_done", "not_done_yet", "first_big_mountain", "gap_to_fill"], properties: { already_done: { type: "array", items: { type: "string" } }, not_done_yet: { type: "array", items: { type: "string" } }, first_big_mountain: { type: "string" }, gap_to_fill: { type: "array", items: { type: "string" } } } }, kpi_drafts: { type: "array", items: { type: "string" } } } },
      next_question: { type: "object", additionalProperties: false, required: ["should_ask", "slot", "question_text", "help_text", "options", "allow_other_text"], properties: { should_ask: { type: "boolean" }, slot: { type: "string" }, question_text: { type: "string" }, help_text: { type: "string" }, allow_other_text: { type: "boolean" }, options: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string" }, label: { type: "string" }, recommended: { type: "boolean" }, reason: { type: "string" } } } } } }
    }
  }
} as const;

const OUTCOME_RESPONSE_SCHEMA = {
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

const TURN_SYSTEM_PROMPT = [
  "あなたはKGI作成のAI面談担当です。毎ターン、ジャンル判定から不足判定と次の1問まで一貫して返してください。",
  "必ずJSONスキーマ通りに返答すること。",
  "質問文は自然な日本語。翻訳調や固い言い回し（納品物、具体的成果を約束など）は避ける。",
  "Logic側テンプレを前提にせず、その時点の文脈だけから current_understanding と draft_output を更新する。",
  "is_ready_for_display と is_ready_for_save は厳密に分離する。",
  "不足があっても draft_output は返す。",
  "ジャンル混線を禁止。投資・トレード型では公開/読者系項目を出さない。",
  "KGIは期限内に判定可能な達成状態のみ。期限をまたぐ内容は next_kgi_candidate や excluded_from_current_kgi に分離する。",
  "JSON以外は返さない。"
].join("\n");

const OUTCOME_SYSTEM_PROMPT = [
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
  if (!apiKey) {
    logError("環境変数未設定", { hasOpenAiApiKey: false });
    return NextResponse.json({ error: "OPENAI_API_KEY is missing", code: "missing_api_key" }, { status: 500 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    logError("不正payload", { bodyType: typeof body });
    return NextResponse.json({ error: "Invalid request body", code: "invalid_request_body" }, { status: 400 });
  }

  const mode = String((body as any).mode || (body as any).action || "outcome").trim().toLowerCase();
  const isTurnMode = mode === "turn";
  const normalizedBody = isTurnMode ? { ...(body as any), deadline: normalizeDeadline((body as any).deadline) } : body;

  const selectedSchema = isTurnMode ? TURN_RESPONSE_SCHEMA : OUTCOME_RESPONSE_SCHEMA;
  const selectedPrompt = isTurnMode ? TURN_SYSTEM_PROMPT : OUTCOME_SYSTEM_PROMPT;
  logInfo("request accepted", {
    mode,
    model: OPENAI_MODEL,
    hasDeadline: Boolean((normalizedBody as any).deadline),
    hasInitialInput: Boolean(String((normalizedBody as any).initial_input || (normalizedBody as any).rawSuccessStateInput || "").trim()),
    conversationTurns: Array.isArray((normalizedBody as any).conversation_turns) ? (normalizedBody as any).conversation_turns.length : 0
  });

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          { role: "system", content: [{ type: "input_text", text: selectedPrompt }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(normalizedBody) }] }
        ],
        text: { format: { type: "json_schema", name: selectedSchema.name, schema: selectedSchema.schema, strict: selectedSchema.strict } }
      })
    });

    const raw = await response.text();
    if (!response.ok) {
      const errorCode = deriveOpenAiHttpErrorCode(response.status);
      logError("OpenAI呼び出し失敗", {
        mode,
        model: OPENAI_MODEL,
        status: response.status,
        errorCode,
        rawText: truncateForLog(raw)
      });
      return NextResponse.json({ error: "Upstream AI request failed", code: "openai_http_error" }, { status: 502 });
    }

    let responseJson: any;
    try {
      responseJson = JSON.parse(raw);
    } catch {
      logError("OpenAIレスポンスJSON parse失敗", { mode, model: OPENAI_MODEL, rawText: truncateForLog(raw) });
      return NextResponse.json({ error: "Upstream response parse failed", code: "openai_response_parse_error" }, { status: 502 });
    }

    const outputText = extractOutputText(responseJson);
    let data: any = null;
    if (outputText) {
      try {
        data = JSON.parse(outputText);
      } catch {
        logError("OpenAI output_text JSON parse失敗", { mode, model: OPENAI_MODEL, outputText: truncateForLog(outputText) });
      }
    }

    if (isTurnMode && (!data?.quality_check || !data?.next_question)) {
      logError("turn schema不足", { parsedKeys: Object.keys(data || {}) });
      return NextResponse.json({ error: "AI output format error", code: "openai_output_schema_error" }, { status: 502 });
    }
    if (!isTurnMode && (!data?.kgiStatement || !data?.aiKgiSourceData)) {
      logError("outcome schema不足", { parsedKeys: Object.keys(data || {}) });
      return NextResponse.json({ error: "AI output format error", code: "openai_output_schema_error" }, { status: 502 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    logError("Unexpected server error", { mode, message: error?.message || "unknown" });
    return NextResponse.json({ error: "Unexpected server error", code: "unexpected_server_error", details: (error as Error)?.message || "unknown" }, { status: 500 });
  }
}
