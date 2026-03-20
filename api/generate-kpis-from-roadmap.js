const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const MAX_PHASES = 5;
const MAX_KPIS = 12;

const SYSTEM_PROMPT = `あなたはロードマップの各フェーズを、初心者にも分かりやすいKPIへ分解するアシスタントです。
目的:
- フェーズごとの進み具合が分かるKPIを作る

ルール:
1. JSONのみ返す
2. kpis 配列で返す
3. 各フェーズごとに2〜4件のKPIを作る
4. 各フェーズに result を1件以上、action を1件以上含める
5. 全体件数は8〜12件程度に抑える
6. 専門用語を減らし、初心者でも分かる表現にする
7. name は指標名、simpleName はもっと分かりやすい表示名にする
8. description は少し具体的に、simpleDescription はやさしく短めにする
9. 抽象的すぎる表現は避け、Taskに落としやすい指標にする
10. targetValue は現実的な整数にする
11. 必ずJSONのみを返す
12. 説明文は禁止
13. \`\`\`json のようなコードブロックも禁止`;

const KPI_RESPONSE_SCHEMA = {
  name: "generate_kpis_from_roadmap_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kpis"],
    properties: {
      kpis: {
        type: "array",
        minItems: 0,
        maxItems: MAX_KPIS,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["phaseId", "name", "description", "simpleName", "simpleDescription", "type", "targetValue"],
          properties: {
            phaseId: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            simpleName: { type: "string" },
            simpleDescription: { type: "string" },
            type: { type: "string", enum: ["result", "action"] },
            targetValue: { type: "integer" }
          }
        }
      }
    }
  }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isValidStatus = (value) => value === "done" || value === "current" || value === "next" || value === "future";

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

const normalizeRoadmapPhases = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((phase, index) => {
      const id = isNonEmptyString(phase?.id) ? phase.id.trim() : `phase_${index + 1}`;
      const title = isNonEmptyString(phase?.title) ? phase.title.trim() : `フェーズ${index + 1}`;
      const description = isNonEmptyString(phase?.description) ? phase.description.trim() : "このフェーズの説明は未設定です";
      const status = isValidStatus(phase?.status) ? phase.status : "future";

      return { id, title, description, status };
    })
    .filter((phase) => phase.id && phase.title)
    .slice(0, MAX_PHASES);
};

const buildPrompt = ({ kgiName, kgiGoalText, roadmapPhases }) => JSON.stringify({
  kgi: {
    name: kgiName,
    goalText: kgiGoalText || "未設定"
  },
  roadmapPhases: roadmapPhases.map((phase) => ({
    id: phase.id,
    title: phase.title,
    description: phase.description,
    status: phase.status
  })),
  output: {
    language: "ja",
    maxTotalKpis: MAX_KPIS,
    phaseRule: "each phase should include at least one result KPI and one action KPI"
  }
});

const normalizeGeneratedKpis = (value, phases) => {
  if (!Array.isArray(value) || phases.length === 0) {
    return [];
  }

  const phaseIds = new Set(phases.map((phase) => phase.id));
  const phaseCounts = new Map();
  const phaseTypeCounts = new Map();
  const normalized = [];

  value.forEach((item) => {
    const phaseId = isNonEmptyString(item?.phaseId) ? item.phaseId.trim() : "";
    const name = isNonEmptyString(item?.name) ? item.name.trim() : "";
    const description = isNonEmptyString(item?.description) ? item.description.trim() : "";
    const simpleName = isNonEmptyString(item?.simpleName) ? item.simpleName.trim() : name;
    const simpleDescription = isNonEmptyString(item?.simpleDescription) ? item.simpleDescription.trim() : description;
    const type = item?.type === "action" ? "action" : item?.type === "result" ? "result" : "";
    const targetValue = Number(item?.targetValue);

    if (!phaseIds.has(phaseId) || !name || !description || !simpleName || !simpleDescription || (type !== "result" && type !== "action") || !Number.isInteger(targetValue) || targetValue <= 0) {
      return;
    }

    const existingCount = phaseCounts.get(phaseId) ?? 0;
    if (existingCount >= 4) {
      return;
    }

    const duplicated = normalized.some((kpi) => kpi.phaseId === phaseId && kpi.name === name);
    if (duplicated) {
      return;
    }

    phaseCounts.set(phaseId, existingCount + 1);
    const typeCount = phaseTypeCounts.get(phaseId) ?? { result: 0, action: 0 };
    typeCount[type] += 1;
    phaseTypeCounts.set(phaseId, typeCount);
    normalized.push({
      phaseId,
      name,
      description,
      simpleName,
      simpleDescription,
      type,
      targetValue
    });
  });

  const hasMinimumBalance = phases.every((phase) => {
    const count = phaseCounts.get(phase.id) ?? 0;
    const typeCount = phaseTypeCounts.get(phase.id) ?? { result: 0, action: 0 };
    return count >= 2 && typeCount.result >= 1 && typeCount.action >= 1;
  });

  if (!hasMinimumBalance && normalized.length > 0) {
    console.warn("[generate-kpis-from-roadmap] where returned error happened: KPI balance validation failed", { normalizedCount: normalized.length });
    return [];
  }

  return normalized.slice(0, MAX_KPIS);
};

module.exports = async function handler(req, res) {
  console.log("reached generate-kpis-from-roadmap route");
  console.log("method", req.method);

  if (req.method !== "POST") {
    console.error("where returned error happened", "method_not_allowed");
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  const requestBody = getRequestBody(req);
  console.log("request body", requestBody);

  const roadmapPhases = normalizeRoadmapPhases(requestBody?.roadmapPhases);
  console.log("roadmapPhases length", roadmapPhases.length);

  const apiKey = process.env.OPENAI_API_KEY;
  console.log("OPENAI_API_KEY", apiKey ? "exists" : "missing");

  if (!apiKey) {
    console.error("where returned error happened", "missing_openai_api_key");
    return sendJson(res, 500, { error: "OPENAI_API_KEY is missing" });
  }

  const kgiName = isNonEmptyString(requestBody?.kgiName) ? requestBody.kgiName.trim() : "";
  const kgiGoalText = isNonEmptyString(requestBody?.kgiGoalText) ? requestBody.kgiGoalText.trim() : "";

  if (!kgiName) {
    console.error("where returned error happened", "invalid_request_body_missing_kgiName");
    return sendJson(res, 400, { error: "Invalid request body" });
  }

  if (roadmapPhases.length === 0) {
    console.warn("where returned error happened", "roadmapPhases_empty_return");
    return sendJson(res, 200, { kpis: [] });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: buildPrompt({ kgiName, kgiGoalText, roadmapPhases }) }] }
        ],
        text: {
          format: {
            type: "json_schema",
            name: KPI_RESPONSE_SCHEMA.name,
            schema: KPI_RESPONSE_SCHEMA.schema,
            strict: KPI_RESPONSE_SCHEMA.strict
          }
        }
      })
    });

    const responseJson = await response.json();
    const rawText = extractOutputText(responseJson);

    if (!response.ok) {
      console.error("where returned error happened", "openai_response_not_ok", { status: response.status, responseJson });
      return sendJson(res, response.status, {
        error: responseJson?.error?.message || "ロードマップからKPIを生成できませんでした"
      });
    }

    let parsed = null;

    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch (error) {
      console.error("where returned error happened", "openai_json_parse_error", { rawText, error });
      return sendJson(res, 500, { error: "invalid json" });
    }

    if (!parsed?.kpis) {
      return sendJson(res, 200, { kpis: [] });
    }

    const kpis = normalizeGeneratedKpis(parsed.kpis, roadmapPhases);
    return sendJson(res, 200, { kpis });
  } catch (error) {
    console.error("where returned error happened", "route_exception", error);
    return sendJson(res, 500, { error: "ロードマップからKPIを生成できませんでした" });
  }
};
