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
  if (typeof responseData?.output_text === "string" && responseData.output_text.trim()) {
    return responseData.output_text.trim();
  }

  if (Array.isArray(responseData?.output)) {
    for (const outputItem of responseData.output) {
      if (!Array.isArray(outputItem?.content)) continue;
      for (const contentItem of outputItem.content) {
        if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
          return contentItem.text.trim();
        }
      }
    }
  }

  return "";
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: "OPENAI_API_KEY is missing" });
  }

  const requestBody = getRequestBody(req);
  if (!requestBody || typeof requestBody !== "object") {
    return sendJson(res, 400, { error: "Invalid request body" });
  }

  const schema = {
    name: "kgi_wizard_writing",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "normalizedSummaryText",
        "feasibilityReasonText",
        "scopeAdjustmentText",
        "questionTexts",
        "candidateTexts"
      ],
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
  };

  const systemPrompt = [
    "あなたはKGI作成ウィザードの文章仕上げ専用アシスタントです。",
    "役割は文章の自然化のみです。判断の骨組みは絶対に変更しないでください。",
    "新しい目標を勝手に発明しないこと。",
    "与えられた構造化データの意味を保ったまま、初心者向けに短くわかりやすい日本語へ整えてください。",
    "長すぎる説明は禁止。重複表現を避け、X/Instagram/YouTubeなど表記を統一してください。",
    "候補数は最大3件、質問は最大3件に収める。",
    "必ずJSONのみ返却。"
  ].join("\n");

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
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify(requestBody) }]
          }
        ],
        text: { format: { type: "json_schema", ...schema } }
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
    if (!outputText) {
      return sendJson(res, 502, { error: "OpenAI empty output" });
    }

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
