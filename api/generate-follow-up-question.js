const OPENAI_API_URL = "https://api.openai.com/v1/responses";

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
  "質問は1問1論点。日本語は自然かつ短く、抽象語だけの質問は禁止。",
  "選択肢は3〜5個。答えやすい具体表現を使い、文脈に合わない選択肢は出さないこと。",
  "必要な時のみotherを追加してよい。allow_other_textはotherを含む場合のみtrue推奨。",
  "FX/投資文脈で、発信前提（ブログ運営など）の選択肢を機械的に混ぜないこと。",
  "返答は必ずJSONのみ。"
].join("\n");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "OPENAI_API_KEY is missing" });

  const requestBody = getRequestBody(req);
  if (!requestBody || typeof requestBody !== "object" || typeof requestBody.slot !== "string") {
    return sendJson(res, 400, { error: "Invalid request body" });
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
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(requestBody) }] }
        ],
        text: { format: { type: "json_schema", ...RESPONSE_SCHEMA } }
      })
    });

    const rawText = await openAiResponse.text();
    if (!openAiResponse.ok) {
      return sendJson(res, openAiResponse.status, { error: "OpenAI API request failed", details: rawText });
    }

    let responseData;
    try {
      responseData = JSON.parse(rawText);
    } catch {
      return sendJson(res, 502, { error: "OpenAI response parse failed" });
    }

    const outputText = extractOutputText(responseData);
    if (!outputText) return sendJson(res, 502, { error: "OpenAI empty output" });

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return sendJson(res, 502, { error: "Model output JSON parse failed" });
    }

    return sendJson(res, 200, parsed);
  } catch (error) {
    return sendJson(res, 500, { error: "Unexpected server error", details: error?.message || "unknown" });
  }
};
