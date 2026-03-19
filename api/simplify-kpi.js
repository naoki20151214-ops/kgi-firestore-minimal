const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはKPIを初心者向けに翻訳する編集者です。
目的:
- 専門的なKPIを、初心者でも分かる表現に変換する

ルール:
1. 専門用語をなるべく使わない
2. 抽象表現を避ける
3. 「何を目指す指標か」が一瞬で分かるようにする
4. できれば行動イメージが浮かぶ表現にする
5. 元の意味は壊さない
6. 日本語で返す
7. JSONのみ返す`;

const RESPONSE_SCHEMA = {
  name: "simplify_kpi_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["simpleName", "simpleDescription"],
    properties: {
      simpleName: { type: "string" },
      simpleDescription: { type: "string" }
    }
  }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const getFallbackResponse = ({ name = "", description = "" }) => ({
  simpleName: isNonEmptyString(name) ? name.trim() : "KPI",
  simpleDescription: isNonEmptyString(description) ? description.trim() : "説明なし"
});

const getRequestBody = (req) => {
  if (!req.body) {
    return null;
  }

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

  if (!Array.isArray(responseData?.output)) {
    return "";
  }

  for (const outputItem of responseData.output) {
    if (!Array.isArray(outputItem?.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (contentItem?.type === "output_text" && typeof contentItem.text === "string" && contentItem.text.trim()) {
        return contentItem.text.trim();
      }
    }
  }

  return "";
};

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  const requestBody = getRequestBody(req);
  const name = typeof requestBody?.name === "string" ? requestBody.name.trim() : "";
  const description = typeof requestBody?.description === "string" ? requestBody.description.trim() : "";
  const type = requestBody?.type === "action" ? "action" : requestBody?.type === "result" ? "result" : "";
  const targetValue = requestBody?.targetValue ?? null;
  const fallback = getFallbackResponse({ name, description });

  if (!name || !type) {
    return sendJson(res, 400, {
      error: 'Invalid request body. Expected JSON: { "name": "string", "description": "string", "type": "result" | "action", "targetValue": number | string | null }.'
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("[simplify-kpi] OPENAI_API_KEY is missing");
    return sendJson(res, 500, { error: "OPENAI_API_KEY is missing" });
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
          {
            role: "system",
            content: [{ type: "input_text", text: SYSTEM_PROMPT }]
          },
          {
            role: "user",
            content: [{
              type: "input_text",
              text: JSON.stringify({
                input: {
                  name,
                  description: description || "未設定",
                  type,
                  targetValue
                },
                examples: [
                  {
                    input: {
                      name: "主要機能の実装完了率（%）",
                      description: "要件定義で特定したコアユーザーストーリーに対して実装・レビュー・結合テストを終えた割合",
                      type: "result",
                      targetValue: 100
                    },
                    output: {
                      simpleName: "主要機能がどれだけ完成したか",
                      simpleDescription: "リリースに必要な大事な機能が、どれくらい完成に近づいているかを表します"
                    }
                  },
                  {
                    input: {
                      name: "CI/CDの成功ビルド数（自動テスト通過）",
                      description: "",
                      type: "action",
                      targetValue: 10
                    },
                    output: {
                      simpleName: "テストに通った開発回数",
                      simpleDescription: "コードを直したあとに、ちゃんと動く状態で積み上げられた回数です"
                    }
                  }
                ],
                outputInstruction: "JSONスキーマに厳密に従い、simpleNameとsimpleDescriptionのみ返してください"
              })
            }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            ...RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text().catch(() => "");
      console.error("[simplify-kpi] OpenAI API request failed", {
        status: openAiResponse.status,
        statusText: openAiResponse.statusText,
        body: errorText
      });
      return sendJson(res, 502, { error: "OpenAI API request failed" });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);

    if (!outputText) {
      console.error("[simplify-kpi] Failed to extract JSON text from OpenAI response", { responseData });
      return sendJson(res, 500, { error: "Failed to parse simplify KPI JSON" });
    }

    const parsed = JSON.parse(outputText);

    return sendJson(res, 200, {
      simpleName: isNonEmptyString(parsed?.simpleName) ? parsed.simpleName.trim() : fallback.simpleName,
      simpleDescription: isNonEmptyString(parsed?.simpleDescription) ? parsed.simpleDescription.trim() : fallback.simpleDescription
    });
  } catch (error) {
    console.error("[simplify-kpi] Unexpected error", error);
    return sendJson(res, 500, { error: "Failed to simplify KPI" });
  }
};
