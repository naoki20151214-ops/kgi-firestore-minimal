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
  name: "kgi_interview_outcome",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["genreClassification", "aiKgiSourceData", "kgiStatement", "kgiSuccessCriteria", "gapAnalysis", "kpiDrafts", "clarifiedSuccessState", "interviewNotes"],
    properties: {
      genreClassification: {
        type: "object",
        additionalProperties: false,
        required: ["primaryGenre", "reason", "multipleKgiDetected", "splitSuggestion"],
        properties: {
          primaryGenre: { type: "string" },
          reason: { type: "string" },
          multipleKgiDetected: { type: "boolean" },
          splitSuggestion: { type: "string" }
        }
      },
      aiKgiSourceData: {
        type: "object",
        additionalProperties: true,
        required: ["upperGoal", "currentKgiScope", "concreteDeliverable", "productShape", "contentScope", "audienceSummary", "valuePromise", "minimumReleaseBundle", "idealReleaseBundle", "hardRequirements", "optionalRequirements", "excludedFromCurrentKgi", "nextKgiSuggestion", "sourceDataNarrative"],
        properties: {
          upperGoal: { type: "string" },
          currentKgiScope: { type: "string" },
          concreteDeliverable: { type: "string" },
          productShape: { type: "string" },
          contentScope: { type: "array", items: { type: "string" } },
          audienceSummary: { type: "string" },
          valuePromise: { type: "string" },
          minimumReleaseBundle: { type: "array", items: { type: "string" } },
          idealReleaseBundle: { type: "array", items: { type: "string" } },
          hardRequirements: { type: "array", items: { type: "string" } },
          optionalRequirements: { type: "array", items: { type: "string" } },
          excludedFromCurrentKgi: { type: "array", items: { type: "string" } },
          nextKgiSuggestion: { type: "string" },
          sourceDataNarrative: { type: "string" }
        }
      },
      kgiStatement: { type: "string" },
      kgiSuccessCriteria: { type: "array", items: { type: "string" } },
      clarifiedSuccessState: { type: "string" },
      gapAnalysis: {
        type: "object",
        additionalProperties: false,
        required: ["alreadyDone", "notDoneYet", "firstBigMountain", "gapToCloseForCurrentKgi"],
        properties: {
          alreadyDone: { type: "array", items: { type: "string" } },
          notDoneYet: { type: "array", items: { type: "string" } },
          firstBigMountain: { type: "string" },
          gapToCloseForCurrentKgi: { type: "array", items: { type: "string" } }
        }
      },
      kpiDrafts: { type: "array", items: { type: "string" } },
      interviewNotes: { type: "array", items: { type: "string" } }
    }
  }
};

const SYSTEM_PROMPT = [
  "あなたはKGI作成のAI面談担当。入力と追加質問回答から、仕様書準拠で結果を一括生成してください。",
  "順番は必ず KGI -> 差分整理 -> KPI。",
  "KGIは期限内で完結判定できる成果状態のみ。期限をまたぐ条件は excludedFromCurrentKgi と nextKgiSuggestion に分離。",
  "自由入力をそのまま貼り付けず、人間が読んで具体像が分かる表現にする。",
  "FX/投資文脈では公開・読者・流入前提を混ぜない。",
  "sourceDataNarrative は短い箇条書き文字列で必須。",
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
    if (!parsed?.kgiStatement || !parsed?.aiKgiSourceData) return sendJson(res, 500, { error: "AI output format error" });
    return sendJson(res, 200, parsed);
  } catch (error) {
    return sendJson(res, 500, { error: "Unexpected server error", details: error?.message || "unknown" });
  }
};
