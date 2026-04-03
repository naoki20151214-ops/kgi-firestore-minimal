const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const ROUTE_LOG_PREFIX = "[api/generate-follow-up-question]";

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

const extractOutputText = (responseData) => {
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

const logInfo = (message, detail = {}) => {
  console.log(`${ROUTE_LOG_PREFIX} ${message}`, detail);
};

const logError = (message, detail = {}) => {
  console.error(`${ROUTE_LOG_PREFIX} ${message}`, detail);
};

const validateGeneratedQuestion = (payload) => {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "schema_invalid:not_object" };
  if (typeof payload.slot !== "string" || !payload.slot.trim()) return { ok: false, reason: "schema_invalid:slot" };
  if (typeof payload.question_text !== "string" || !payload.question_text.trim()) return { ok: false, reason: "schema_invalid:question_text" };
  if (!Array.isArray(payload.options)) return { ok: false, reason: "schema_invalid:options_not_array" };
  if (payload.options.length < 3 || payload.options.length > 5) return { ok: false, reason: "schema_invalid:options_size" };
  if (payload.options.some((opt) => !opt || typeof opt !== "object" || !String(opt.id || "").trim() || !String(opt.label || "").trim())) {
    return { ok: false, reason: "schema_invalid:option_item" };
  }
  if (typeof payload.allow_other_text !== "boolean") return { ok: false, reason: "schema_invalid:allow_other_text" };
  return { ok: true };
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
};

const SYSTEM_PROMPT = [
  "あなたはKGI作成ウィザードの追加質問を1問だけ生成するアシスタントです。",
  "固定なのはslotのみ。question_textとoptionsは毎回ユーザー文脈に合わせて調整すること。",
  "質問は1問1論点。日本語は自然かつ短く、会話的でスマホで一読理解できる表現にすること。",
  "翻訳調や硬い語（例: 納品物、成果物、判定可能にする、具体的成果）を避けること。",
  "選択肢は3〜5個。答えやすい具体表現を使い、文脈に合わない選択肢は出さないこと。",
  "必要な時のみotherを追加してよい。allow_other_textはotherを含む場合のみtrue推奨。",
  "FX/投資文脈で、発信前提（ブログ運営など）の選択肢を機械的に混ぜないこと。",
  "前のケースや前セッションの内容を推測で持ち込まず、必ず入力payload内の文脈だけで生成すること。",
  "返答は必ずJSONのみ。"
].join("\n");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logError("環境変数読み込み失敗", { hasOpenAiApiKey: false });
    return sendJson(res, 500, { error: "Server configuration error" });
  }
  logInfo("環境変数読み込み成功", { hasOpenAiApiKey: true });

  const requestBody = getRequestBody(req);
  if (!requestBody || typeof requestBody !== "object" || typeof requestBody.slot !== "string") {
    logError("不正payload(400)", { bodyType: typeof requestBody, hasSlot: Boolean(requestBody?.slot) });
    return sendJson(res, 400, { error: "Invalid request body" });
  }
  logInfo("入力payload検証成功", { slot: requestBody.slot });

  try {
    logInfo("OpenAI呼び出し開始", { slot: requestBody.slot });
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
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(requestBody) }] }
        ],
        text: { format: { type: "json_schema", ...RESPONSE_SCHEMA } }
      })
    });
    logInfo("OpenAI応答受信", { slot: requestBody.slot, status: openAiResponse.status, ok: openAiResponse.ok });

    const rawText = await openAiResponse.text();
    if (!openAiResponse.ok) {
      logError("OpenAI応答エラー", { slot: requestBody.slot, status: openAiResponse.status, rawText });
      return sendJson(res, 502, { error: "Upstream AI request failed" });
    }

    let responseData;
    try {
      responseData = JSON.parse(rawText);
      logInfo("OpenAIレスポンスJSON parse成功", { slot: requestBody.slot });
    } catch {
      logError("OpenAIレスポンスJSON parse失敗", { slot: requestBody.slot, rawText });
      return sendJson(res, 502, { error: "Upstream response parse failed" });
    }

    const outputText = extractOutputText(responseData);
    if (!outputText) {
      logError("OpenAI出力が空", { slot: requestBody.slot, responseKeys: Object.keys(responseData || {}) });
      return sendJson(res, 502, { error: "Upstream AI output was empty" });
    }
    logInfo("OpenAI出力テキスト抽出成功", { slot: requestBody.slot, outputLength: outputText.length });

    let parsed;
    try {
      parsed = JSON.parse(outputText);
      logInfo("モデル出力JSON parse成功", { slot: requestBody.slot });
    } catch {
      logError("モデル出力JSON parse失敗", { slot: requestBody.slot, outputText });
      return sendJson(res, 500, { error: "AI output format error" });
    }

    const validation = validateGeneratedQuestion(parsed);
    if (!validation.ok) {
      logError("JSON schema validation失敗", { slot: requestBody.slot, reason: validation.reason, parsed });
      return sendJson(res, 500, { error: `AI output schema error: ${validation.reason}` });
    }
    if (parsed.slot !== requestBody.slot) {
      logError("slot不一致", { requestedSlot: requestBody.slot, generatedSlot: parsed.slot });
      return sendJson(res, 500, { error: "AI output schema error: slot mismatch" });
    }
    logInfo("JSON schema validation成功", { slot: requestBody.slot, optionsCount: parsed.options.length });

    return sendJson(res, 200, parsed);
  } catch (error) {
    logError("Unexpected server error", { slot: requestBody.slot, message: error?.message || "unknown" });
    return sendJson(res, 500, { error: "Unexpected server error" });
  }
};
