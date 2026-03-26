const OPENAI_API_URL = "https://api.openai.com/v1/responses";

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

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

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
  const phaseName = isNonEmptyString(requestBody?.phaseName) ? requestBody.phaseName.trim() : "";
  const phasePurpose = isNonEmptyString(requestBody?.phasePurpose) ? requestBody.phasePurpose.trim() : "";
  const existingKpis = Array.isArray(requestBody?.existingKpis) ? requestBody.existingKpis : [];

  if (!kgiName || !phaseName) {
    return sendJson(res, 400, { error: "Invalid request body" });
  }

  const systemPrompt = `あなたはKPI整理の専門家です。重複検出、統合提案、不要KPI整理、最終KPIセット提案を行います。JSONのみ返してください。`;
  const schema = {
    name: "kpi_cleanup_proposal",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "duplicateGroups", "mergeSuggestions", "removeSuggestions", "finalKpis"],
      properties: {
        summary: { type: "string" },
        duplicateGroups: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "kpiIds", "kpiNames", "reason"],
            properties: {
              label: { type: "string" },
              kpiIds: { type: "array", items: { type: "string" } },
              kpiNames: { type: "array", items: { type: "string" } },
              reason: { type: "string" }
            }
          }
        },
        mergeSuggestions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "fromKpiId", "toKpiId", "fromKpiName", "toKpiName", "reason"],
            properties: {
              label: { type: "string" },
              fromKpiId: { type: "string" },
              toKpiId: { type: "string" },
              fromKpiName: { type: "string" },
              toKpiName: { type: "string" },
              reason: { type: "string" }
            }
          }
        },
        removeSuggestions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "kpiId", "kpiName", "reason"],
            properties: {
              label: { type: "string" },
              kpiId: { type: "string" },
              kpiName: { type: "string" },
              reason: { type: "string" }
            }
          }
        },
        finalKpis: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "kpiId", "name", "reason"],
            properties: {
              label: { type: "string" },
              kpiId: { type: "string" },
              name: { type: "string" },
              reason: { type: "string" }
            }
          }
        }
      }
    }
  };

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
            content: [{
              type: "input_text",
              text: [
                `KGI: ${kgiName}`,
                `対象フェーズ: ${phaseName}`,
                `フェーズ目的: ${phasePurpose || "未設定"}`,
                `既存KPI: ${JSON.stringify(existingKpis)}`,
                "重複検出、統合提案、不要提案、最終セットを出してください。"
              ].join("\n")
            }]
          }
        ],
        text: { format: { type: "json_schema", ...schema } }
      })
    });

    const rawText = await openAiResponse.text();
    if (!openAiResponse.ok) {
      return sendJson(res, openAiResponse.status, { error: "OpenAI API request failed", details: rawText });
    }

    const responseData = JSON.parse(rawText);
    const outputText = responseData?.output_text?.trim?.() || "";
    if (!outputText) {
      return sendJson(res, 502, { error: "No output_text returned from OpenAI API" });
    }
    const parsed = JSON.parse(outputText);
    return sendJson(res, 200, parsed);
  } catch (error) {
    return sendJson(res, 500, {
      error: "Failed to generate cleanup proposal",
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
