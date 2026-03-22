const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはKPI設計の専門家です。
与えられた目標を、測定可能なKPI候補に分解してください。

ルール:
- KPIは「測れる指標」にする
- 結果を測るもの/行動量・頻度を測るものの区別は維持する
- 単体で大きな別プロジェクトになる目標は subKgiCandidates に分類する
- KGIをそのまま言い換えただけの項目は作らない
- 既存KPIと意味が近いものは提案しない
- 既存categoryのうち不足している観点だけを優先して提案する
- 提案は最大3件まで。不足がなければ追加不要として空配列を返してよい
- 各提案には category と reason を必ず付ける
- category は research / design / build / quality / validation / distribution / monetization のいずれかに限定する
- 出力は必ず JSON のみ
- 日本語で返す
- resultKpis と actionKpis の合計は最大3件
- subKgiCandidates は 0〜3件
- targetValue は現実的な整数にする`;

const KPI_RESPONSE_SCHEMA = {
  name: "generate_kpis_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["resultKpis", "actionKpis", "subKgiCandidates"],
    properties: {
      resultKpis: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "targetValue", "category", "reason"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            targetValue: { type: "integer" },
            category: { type: "string", enum: ["research", "design", "build", "quality", "validation", "distribution", "monetization"] },
            reason: { type: "string" }
          }
        }
      },
      actionKpis: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "targetValue", "category", "reason"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            targetValue: { type: "integer" },
            category: { type: "string", enum: ["research", "design", "build", "quality", "validation", "distribution", "monetization"] },
            reason: { type: "string" }
          }
        }
      },
      subKgiCandidates: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description"],
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          }
        }
      }
    }
  }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const isValidKpiItem = (value) => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { title, description, targetValue, category, reason } = value;

  return (
    isNonEmptyString(title) &&
    isNonEmptyString(description) &&
    isNonEmptyString(category) &&
    isNonEmptyString(reason) &&
    typeof targetValue === "number" &&
    Number.isInteger(targetValue) &&
    Number.isFinite(targetValue)
  );
};

const isValidSubKgiCandidate = (value) => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { title, description } = value;
  return isNonEmptyString(title) && isNonEmptyString(description);
};

const isValidGenerateKpisResponse = (value) => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { resultKpis, actionKpis, subKgiCandidates } = value;

  if (!Array.isArray(resultKpis) || !Array.isArray(actionKpis) || !Array.isArray(subKgiCandidates)) {
    return false;
  }

  if (resultKpis.length > 3) {
    return false;
  }

  if (actionKpis.length > 3) {
    return false;
  }

  if (resultKpis.length + actionKpis.length > 3) {
    return false;
  }

  if (subKgiCandidates.length > 3) {
    return false;
  }

  return (
    resultKpis.every(isValidKpiItem) &&
    actionKpis.every(isValidKpiItem) &&
    subKgiCandidates.every(isValidSubKgiCandidate)
  );
};

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

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("[generate-kpis] OPENAI_API_KEY is missing", {
      hasOpenAiApiKey: false
    });
    return sendJson(res, 500, { error: "OPENAI_API_KEY is missing" });
  }

  const requestBody = getRequestBody(req);
  const goal = typeof requestBody?.goal === "string" ? requestBody.goal.trim() : "";
  const phase = typeof requestBody?.phase === "string" ? requestBody.phase.trim() : "";
  const existingKpis = Array.isArray(requestBody?.existingKpis) ? requestBody.existingKpis : [];

  if (!goal) {
    console.error("[generate-kpis] Invalid request body", {
      requestBody
    });
    return sendJson(res, 400, {
      error: 'Invalid request body. Expected JSON: { "goal": "string" }.'
    });
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
            content: [
              {
                type: "input_text",
                text: [
                  `目標: ${goal}`,
                  `phase: ${phase || "未設定"}`,
                  `既存KPI一覧: ${JSON.stringify(existingKpis.map((item) => ({
                    name: typeof item?.name === "string" ? item.name.trim() : "",
                    description: typeof item?.description === "string" ? item.description.trim() : "",
                    phase: typeof item?.phaseId === "string" ? item.phaseId.trim() : "",
                    category: typeof item?.category === "string" ? item.category.trim() : "",
                    status: typeof item?.status === "string" ? item.status.trim() : "active"
                  })))}`,
                  `既存category一覧: ${JSON.stringify([...new Set(existingKpis.map((item) => typeof item?.category === "string" ? item.category.trim() : "").filter(Boolean))])}`,
                  `不足category一覧: ${JSON.stringify(["research", "design", "build", "quality", "validation", "distribution", "monetization"].filter((category) => !existingKpis.some((item) => typeof item?.category === "string" && item.category.trim() === category)))}`,
                  "重複禁止。不足のみ。最大3件。追加不要も可。指定のJSONスキーマに厳密に従って、KPI候補だけを返してください。"
                ].join("\n\n")
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            ...KPI_RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text().catch(() => "");
      console.error("[generate-kpis] OpenAI API request failed", {
        status: openAiResponse.status,
        statusText: openAiResponse.statusText,
        body: errorText
      });
      return sendJson(res, 502, { error: "OpenAI API request failed" });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);

    if (!outputText) {
      console.error("[generate-kpis] Failed to extract JSON text from OpenAI response", {
        responseData
      });
      return sendJson(res, 500, { error: "Failed to parse KPI JSON" });
    }

    let parsedResponse;

    try {
      parsedResponse = JSON.parse(outputText);
    } catch (error) {
      console.error("[generate-kpis] JSON parse failed", {
        error,
        outputText
      });
      return sendJson(res, 500, { error: "Failed to parse KPI JSON" });
    }

    if (!isValidGenerateKpisResponse(parsedResponse)) {
      console.error("[generate-kpis] Parsed KPI JSON did not match expected schema", {
        parsedResponse
      });
      return sendJson(res, 500, { error: "Failed to parse KPI JSON" });
    }

    return sendJson(res, 200, parsedResponse);
  } catch (error) {
    console.error("[generate-kpis] Unexpected server error", error);
    return sendJson(res, 500, { error: "Unexpected server error" });
  }
}
