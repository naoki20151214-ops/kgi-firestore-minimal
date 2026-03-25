const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはKPI設計の専門家です。
与えられたKGIとフェーズ情報から、そのフェーズで追うべきKPI候補を作成してください。

ルール:
- JSONのみ返す
- kpis配列を返す
- KPI件数は3〜5件
- 各KPIは name, description, type, targetValue を持つ
- type は result または action
- result と action を最低1件ずつ含める
- name は測定できる指標名にする
- description は短く具体的にする
- targetValue は現実的な正の整数にする
- 既存KPIと重複するKPIを絶対に出さない
- 同義反復（言い換えだけで実質同じKPI）を避ける
- 役割・意図が同じKPIを複数出さない
- 日本語で返す`;

const KPI_RESPONSE_SCHEMA = {
  name: "generate_phase_kpis_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kpis"],
    properties: {
      kpis: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description", "type", "targetValue"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            type: { type: "string", enum: ["result", "action"] },
            targetValue: { type: "integer" }
          }
        }
      }
    }
  }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
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

const normalizeKpis = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item) => {
      const name = isNonEmptyString(item?.name) ? item.name.trim() : "";
      const description = isNonEmptyString(item?.description) ? item.description.trim() : "";
      const type = item?.type === "result" ? "result" : item?.type === "action" ? "action" : "";
      const targetValue = Number(item?.targetValue);

      if (!name || !description || !type || !Number.isInteger(targetValue) || targetValue <= 0) {
        return null;
      }

      return {
        name,
        description,
        type,
        targetValue
      };
    })
    .filter(Boolean);

  if (normalized.length < 3 || normalized.length > 5) {
    return [];
  }

  const hasResult = normalized.some((kpi) => kpi.type === "result");
  const hasAction = normalized.some((kpi) => kpi.type === "action");

  if (!hasResult || !hasAction) {
    return [];
  }

  return normalized;
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
  const kgiName = isNonEmptyString(requestBody?.kgiName) ? requestBody.kgiName.trim() : "";
  const goalDescription = isNonEmptyString(requestBody?.goalDescription)
    ? requestBody.goalDescription.trim()
    : isNonEmptyString(requestBody?.goal)
      ? requestBody.goal.trim()
      : "";
  const phaseName = isNonEmptyString(requestBody?.phaseName)
    ? requestBody.phaseName.trim()
    : isNonEmptyString(requestBody?.phase)
      ? requestBody.phase.trim()
      : "";
  const phasePurpose = isNonEmptyString(requestBody?.phasePurpose) ? requestBody.phasePurpose.trim() : "";
  const targetDate = isNonEmptyString(requestBody?.targetDate) ? requestBody.targetDate.trim() : "未設定";
  const phaseDeadline = isNonEmptyString(requestBody?.phaseDeadline) ? requestBody.phaseDeadline.trim() : "未設定";
  const existingKpis = Array.isArray(requestBody?.existingKpis)
    ? requestBody.existingKpis
      .map((item) => {
        const name = isNonEmptyString(item?.name) ? item.name.trim() : "";
        const description = isNonEmptyString(item?.description) ? item.description.trim() : "";
        const type = item?.type === "result" ? "result" : item?.type === "action" ? "action" : "";
        if (!name) {
          return null;
        }
        return { name, description: description || "未設定", type: type || "未設定" };
      })
      .filter(Boolean)
    : [];

  if (!kgiName || !phaseName) {
    return sendJson(res, 400, {
      error: 'Invalid request body. Expected JSON with "kgiName" and "phaseName".'
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
            content: [{
              type: "input_text",
              text: [
                `KGI名: ${kgiName}`,
                `ゴール説明: ${goalDescription || "未設定"}`,
                `対象フェーズ名: ${phaseName}`,
                `対象フェーズの目的: ${phasePurpose || "未設定"}`,
                `目標期限日: ${targetDate}`,
                `フェーズ期限: ${phaseDeadline}`,
                `既存KPI一覧: ${existingKpis.length ? JSON.stringify(existingKpis, null, 2) : "なし"}`,
                "既存KPIと重複しない候補のみを返してください。",
                "同じ役割・同じ評価軸になる候補は1つに絞ってください。",
                "JSONスキーマに厳密に従い、KPI候補のみを返してください。"
              ].join("\n")
            }]
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

    const rawText = await openAiResponse.text();
    if (!openAiResponse.ok) {
      return sendJson(res, openAiResponse.status, {
        error: "OpenAI API request failed",
        details: rawText
      });
    }

    let responseData;
    try {
      responseData = JSON.parse(rawText);
    } catch {
      return sendJson(res, 502, { error: "Failed to parse OpenAI API response as JSON" });
    }

    const outputText = extractOutputText(responseData);
    if (!outputText) {
      return sendJson(res, 502, { error: "No output_text returned from OpenAI API" });
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return sendJson(res, 502, { error: "Failed to parse model output as JSON" });
    }

    const kpis = normalizeKpis(parsed?.kpis);
    if (!kpis.length) {
      return sendJson(res, 502, { error: "Model output validation failed" });
    }

    return sendJson(res, 200, { kpis });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Failed to generate KPI candidates",
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
