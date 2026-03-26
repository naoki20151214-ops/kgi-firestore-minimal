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

const extractOutputText = (responseData) => {
  if (typeof responseData?.output_text === "string" && responseData.output_text.trim()) {
    return { text: responseData.output_text.trim(), source: "output_text" };
  }

  if (Array.isArray(responseData?.output)) {
    for (const outputItem of responseData.output) {
      if (!Array.isArray(outputItem?.content)) {
        continue;
      }

      for (const contentItem of outputItem.content) {
        if (contentItem?.type === "output_text" && typeof contentItem.text === "string" && contentItem.text.trim()) {
          return { text: contentItem.text.trim(), source: "output[].content[].text(output_text)" };
        }

        if (contentItem?.type === "text" && typeof contentItem.text === "string" && contentItem.text.trim()) {
          return { text: contentItem.text.trim(), source: "output[].content[].text(text)" };
        }

        if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
          return { text: contentItem.text.trim(), source: "output[].content[].text(*)" };
        }
      }
    }
  }

  if (Array.isArray(responseData?.content)) {
    for (const contentItem of responseData.content) {
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
        return { text: contentItem.text.trim(), source: "content[].text" };
      }

      if (Array.isArray(contentItem?.content)) {
        for (const nestedItem of contentItem.content) {
          if (typeof nestedItem?.text === "string" && nestedItem.text.trim()) {
            return { text: nestedItem.text.trim(), source: "content[].content[].text" };
          }
        }
      }
    }
  }

  return { text: "", source: "not_found" };
};

const normalizeCleanupPayload = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const summary = isNonEmptyString(value.summary) ? value.summary.trim() : "";
  const duplicateGroups = Array.isArray(value.duplicateGroups) ? value.duplicateGroups : [];
  const mergeSuggestions = Array.isArray(value.mergeSuggestions) ? value.mergeSuggestions : [];
  const removeSuggestions = Array.isArray(value.removeSuggestions) ? value.removeSuggestions : [];
  const finalKpis = Array.isArray(value.finalKpis) ? value.finalKpis : [];

  if (!summary) {
    return null;
  }

  return {
    summary,
    duplicateGroups,
    mergeSuggestions,
    removeSuggestions,
    finalKpis
  };
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
    console.log("[generate-kpi-cleanup] raw OpenAI response text:", rawText);

    if (!openAiResponse.ok) {
      return sendJson(res, openAiResponse.status, { error: "OpenAI API request failed", details: rawText });
    }

    let responseData;
    try {
      responseData = JSON.parse(rawText);
    } catch {
      return sendJson(res, 502, {
        error: "OpenAIレスポンスのJSON解析に失敗しました",
        cause: "openai_response_parse_failed"
      });
    }

    console.log("[generate-kpi-cleanup] parsed OpenAI response data:", responseData);

    const extraction = extractOutputText(responseData);
    console.log("[generate-kpi-cleanup] extracted text source:", extraction.source);

    if (!extraction.text) {
      return sendJson(res, 502, {
        error: "OpenAIから有効な本文が返りませんでした",
        cause: "openai_empty_output",
        details: {
          hasOutputText: Boolean(responseData?.output_text),
          hasOutputArray: Array.isArray(responseData?.output),
          hasContentArray: Array.isArray(responseData?.content)
        }
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(extraction.text);
    } catch {
      return sendJson(res, 502, {
        error: "モデル出力のJSON解析に失敗しました",
        cause: "model_output_json_parse_failed",
        outputSource: extraction.source
      });
    }

    const normalized = normalizeCleanupPayload(parsed);
    if (!normalized) {
      return sendJson(res, 502, {
        error: "モデル出力が期待スキーマを満たしていません",
        cause: "schema_validation_failed",
        outputSource: extraction.source
      });
    }

    return sendJson(res, 200, normalized);
  } catch (error) {
    return sendJson(res, 500, {
      error: "Failed to generate cleanup proposal",
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
