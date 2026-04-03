const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
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
};

const SYSTEM_PROMPT = [
  "あなたはKGI作成フローのジャンル判定担当です。",
  "入力から最初にジャンルを判定し、必要ならKGI分割提案を行ってください。",
  "候補ジャンル: 情報発信・メディア型, 商品販売型, サービス受注型, アプリ・ツール提供型, 投資・トレード型, 自己改善型, その他。",
  "FX/投資なら公開・読者前提の質問を推奨しないこと。",
  "suggestedSlots には次に聞くべき slot id を最大6個まで入れる。",
  "JSONのみ返す。"
].join("\n");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Server configuration error" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

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
        text: { format: { type: "json_schema", ...RESPONSE_SCHEMA } }
      })
    });
    const raw = await response.text();
    if (!response.ok) return sendJson(res, 502, { error: "Upstream AI request failed", details: raw });
    const outputText = extractOutputText(JSON.parse(raw));
    const parsed = outputText ? JSON.parse(outputText) : null;
    if (!parsed?.primaryGenre) return sendJson(res, 500, { error: "AI output format error" });
    return sendJson(res, 200, parsed);
  } catch (error) {
    return sendJson(res, 500, { error: "Unexpected server error", details: error?.message || "unknown" });
  }
};
