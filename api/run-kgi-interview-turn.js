const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const ROUTE_LOG_PREFIX = "[api/run-kgi-interview-turn]";

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

const getRequestBody = (req) => {
  if (!req.body) return null;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body;
};

const logInfo = (message, detail = {}) => {
  console.log(`${ROUTE_LOG_PREFIX} ${message}`, detail);
};

const logError = (message, detail = {}) => {
  console.error(`${ROUTE_LOG_PREFIX} ${message}`, detail);
};

const normalizeDeadline = (value) => {
  const input = String(value || "").trim();
  if (!input) return "";
  const replaced = input.replace(/[/.]/g, "-").replace(/年/g, "-").replace(/月/g, "-").replace(/日/g, "");
  const match = replaced.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return input;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

const extractStructuredOutput = (responseData) => {
  const outputText = typeof responseData?.output_text === "string" ? responseData.output_text.trim() : "";
  if (outputText) {
    try {
      return JSON.parse(outputText);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(responseData?.output)) return null;
  for (const outputItem of responseData.output) {
    if (!Array.isArray(outputItem?.content)) continue;
    for (const contentItem of outputItem.content) {
      if (contentItem && typeof contentItem === "object") {
        if (contentItem.parsed && typeof contentItem.parsed === "object") return contentItem.parsed;
        if (contentItem.json && typeof contentItem.json === "object") return contentItem.json;
        if (typeof contentItem.text === "string" && contentItem.text.trim()) {
          try {
            return JSON.parse(contentItem.text.trim());
          } catch {
            // no-op
          }
        }
      }
    }
  }
  return null;
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
};

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logError("環境変数未設定", { hasOpenAiApiKey: false });
    return sendJson(res, 500, { error: "OPENAI_API_KEY is missing", code: "missing_api_key" });
  }

  const requestBody = getRequestBody(req);
  if (!requestBody || typeof requestBody !== "object") {
    logError("不正payload", { bodyType: typeof requestBody });
    return sendJson(res, 400, { error: "Invalid request body", code: "invalid_request_body" });
  }

  const normalizedBody = {
    ...requestBody,
    deadline: normalizeDeadline(requestBody.deadline)
  };

  logInfo("run turn request accepted", {
    hasDeadline: Boolean(normalizedBody.deadline),
    hasInitialInput: Boolean(String(normalizedBody.initial_input || "").trim()),
    hasCurrentState: Boolean(normalizedBody.current_state),
    conversationTurns: Array.isArray(normalizedBody.conversation_turns) ? normalizedBody.conversation_turns.length : 0
  });

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
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(normalizedBody) }] }
        ],
        text: { format: { type: "json_schema", ...RESPONSE_SCHEMA } }
      })
    });

    const rawText = await openAiResponse.text();
    if (!openAiResponse.ok) {
      logError("OpenAI呼び出し失敗", { status: openAiResponse.status, rawText });
      return sendJson(res, 502, { error: "Upstream AI request failed", code: "openai_http_error" });
    }

    let responseData;
    try {
      responseData = JSON.parse(rawText);
    } catch {
      logError("OpenAIレスポンスJSON parse失敗", { rawText });
      return sendJson(res, 502, { error: "Upstream response parse failed", code: "openai_response_parse_error" });
    }

    const parsed = extractStructuredOutput(responseData);
    if (!parsed?.quality_check || !parsed?.next_question) {
      logError("モデル返却schema不足", { parsedKeys: Object.keys(parsed || {}), responseKeys: Object.keys(responseData || {}) });
      return sendJson(res, 502, { error: "AI output format error", code: "openai_output_schema_error" });
    }

    return sendJson(res, 200, parsed);
  } catch (error) {
    logError("Unexpected server error", { message: error?.message || "unknown" });
    return sendJson(res, 500, { error: "Unexpected server error", code: "unexpected_server_error" });
  }
};
