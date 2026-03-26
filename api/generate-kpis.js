const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const DECISIONS = {
  NO_ADDITIONAL: "no_additional_kpis_needed",
  CLEANUP_ONLY: "cleanup_only",
  PROPOSE_MISSING_ONLY: "propose_missing_only"
};
const KPI_CATEGORIES = ["acquisition", "activation", "retention", "feedback", "monetization", "decision"];

const SYSTEM_PROMPT = `あなたはKPI設計の専門家です。
与えられたKGIとフェーズ情報、既存KPI一覧を必ず先に評価し、必要最小限の提案だけを返してください。

目的:
- フェーズごとのKPIを必要最小限に保つ
- 重複や役割かぶりを減らす
- 不足している役割がある場合のみ追加提案する

ルール:
- JSONのみ返す
- 既存KPI一覧を必ず先に評価する
- まず重複・役割かぶり・不足役割・必要十分性を判定する
- decision は次のいずれか
  - no_additional_kpis_needed
  - cleanup_only
  - propose_missing_only
- reason は日本語で具体的に書く
- duplicates には重複/役割かぶりの候補を入れる
- missingCategories には不足している役割カテゴリのみ入れる
- proposedKpis は不足がある時だけ必要最小限で提案する（0〜3件）
- decision が no_additional_kpis_needed または cleanup_only の場合、proposedKpis は空配列にする
- proposedKpis の各要素は name, description, type, category, targetValue を持つ
- type は result または action
- category は次のいずれか: acquisition / activation / retention / feedback / monetization / decision
- name は測定できる指標名にする
- description は短く具体的にする
- targetValue は現実的な正の整数にする
- 既存KPIと重複する候補を出さない
- 同義反復（言い換えだけで実質同じKPI）を避ける
- 役割・意図が同じKPIを複数出さない
- 同じ phase 内では同じ category のKPIを複数提案しない
- missingCategories で示された category だけを提案対象にする
- 対象フェーズで本当に必要なKPIだけに絞る
- 後続フェーズで実施すべき内容を先取りしない
- 生成前メモ（重視/回避）がある場合は最優先で反映する
- 日本語で返す`;

const KPI_RESPONSE_SCHEMA = {
  name: "generate_phase_kpis_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decision", "reason", "duplicates", "missingCategories", "proposedKpis"],
    properties: {
      decision: {
        type: "string",
        enum: [DECISIONS.NO_ADDITIONAL, DECISIONS.CLEANUP_ONLY, DECISIONS.PROPOSE_MISSING_ONLY]
      },
      reason: { type: "string" },
      duplicates: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kpiName", "reason"],
          properties: {
            kpiName: { type: "string" },
            reason: { type: "string" }
          }
        }
      },
      missingCategories: {
        type: "array",
        maxItems: 8,
        items: { type: "string" }
      },
      proposedKpis: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description", "type", "category", "targetValue"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            type: { type: "string", enum: ["result", "action"] },
            category: { type: "string", enum: KPI_CATEGORIES },
            targetValue: { type: "integer" }
          }
        }
      }
    }
  }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const parsePhaseNumber = (value, fallback) => {
  const numberValue = Number(value);
  if (Number.isFinite(numberValue) && numberValue > 0) {
    return Math.round(numberValue);
  }
  return fallback;
};

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

const normalizeTextList = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (isNonEmptyString(item) ? item.trim() : ""))
    .filter(Boolean);
};

const normalizeDuplicates = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const kpiName = isNonEmptyString(item?.kpiName) ? item.kpiName.trim() : "";
      const reason = isNonEmptyString(item?.reason) ? item.reason.trim() : "";
      if (!kpiName || !reason) {
        return null;
      }
      return { kpiName, reason };
    })
    .filter(Boolean);
};

const normalizeProposedKpis = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const name = isNonEmptyString(item?.name) ? item.name.trim() : "";
      const description = isNonEmptyString(item?.description) ? item.description.trim() : "";
      const type = item?.type === "result" ? "result" : item?.type === "action" ? "action" : "";
      const category = KPI_CATEGORIES.includes(item?.category) ? item.category : "";
      const targetValue = Number(item?.targetValue);

      if (!name || !description || !type || !category || !Number.isInteger(targetValue) || targetValue <= 0) {
        return null;
      }

      return {
        name,
        description,
        type,
        category,
        targetValue
      };
    })
    .filter(Boolean)
    .slice(0, 3);
};

const normalizeDecisionPayload = (value) => {
  const decision = value?.decision;
  const reason = isNonEmptyString(value?.reason) ? value.reason.trim() : "";

  if (!Object.values(DECISIONS).includes(decision) || !reason) {
    return null;
  }

  const duplicates = normalizeDuplicates(value?.duplicates);
  const missingCategories = normalizeTextList(value?.missingCategories);
  const proposedKpis = normalizeProposedKpis(value?.proposedKpis);

  return { decision, reason, duplicates, missingCategories, proposedKpis };
};

const enforceDecisionPriority = ({ normalized, requestMissingCategories }) => {
  const requestedMissing = Array.isArray(requestMissingCategories)
    ? requestMissingCategories.filter((item) => KPI_CATEGORIES.includes(item))
    : [];
  const duplicateHints = Array.isArray(normalized?.duplicates) ? normalized.duplicates : [];
  const missingCategories = Array.isArray(normalized?.missingCategories)
    ? normalized.missingCategories.filter((item) => KPI_CATEGORIES.includes(item))
    : [];
  const effectiveMissingCategories = requestedMissing.length > 0 ? requestedMissing : missingCategories;
  const filteredProposed = Array.isArray(normalized?.proposedKpis)
    ? normalized.proposedKpis.filter((item) => effectiveMissingCategories.includes(item?.category))
    : [];

  if (duplicateHints.length > 0) {
    return {
      ...normalized,
      decision: DECISIONS.CLEANUP_ONLY,
      missingCategories: effectiveMissingCategories,
      proposedKpis: []
    };
  }

  if (effectiveMissingCategories.length === 0) {
    return {
      ...normalized,
      decision: DECISIONS.NO_ADDITIONAL,
      missingCategories: [],
      proposedKpis: []
    };
  }

  return {
    ...normalized,
    decision: DECISIONS.PROPOSE_MISSING_ONLY,
    missingCategories: effectiveMissingCategories,
    proposedKpis: filteredProposed
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
        const category = KPI_CATEGORIES.includes(item?.category) ? item.category : "未設定";
        if (!name) {
          return null;
        }
        return { name, description: description || "未設定", type: type || "未設定", category };
      })
      .filter(Boolean)
    : [];
  const allowedCategories = Array.isArray(requestBody?.categoryPolicy?.allowedCategories)
    ? requestBody.categoryPolicy.allowedCategories.filter((item) => KPI_CATEGORIES.includes(item))
    : KPI_CATEGORIES;
  const missingCategories = Array.isArray(requestBody?.categoryPolicy?.missingCategories)
    ? requestBody.categoryPolicy.missingCategories.filter((item) => KPI_CATEGORIES.includes(item))
    : [];
  const allPhases = Array.isArray(requestBody?.allPhases)
    ? requestBody.allPhases
      .map((phase, index) => {
        const id = isNonEmptyString(phase?.id) ? phase.id.trim() : `phase_${index + 1}`;
        const name = isNonEmptyString(phase?.name) ? phase.name.trim() : "";
        const purpose = isNonEmptyString(phase?.purpose) ? phase.purpose.trim() : "未設定";
        const deadline = isNonEmptyString(phase?.deadline) ? phase.deadline.trim() : "未設定";
        const phaseNumber = parsePhaseNumber(phase?.phaseNumber, index + 1);

        if (!name) {
          return null;
        }

        return { id, phaseNumber, name, purpose, deadline };
      })
      .filter(Boolean)
    : [];
  const focusOrAvoid = isNonEmptyString(requestBody?.focusOrAvoid) ? requestBody.focusOrAvoid.trim() : "";

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
                `全フェーズ一覧: ${allPhases.length ? JSON.stringify(allPhases, null, 2) : "未設定"}`,
                `既存KPI一覧: ${existingKpis.length ? JSON.stringify(existingKpis, null, 2) : "なし"}`,
                `利用可能なKPIカテゴリ: ${JSON.stringify(allowedCategories)}`,
                `このフェーズで不足しているカテゴリ: ${JSON.stringify(missingCategories)}`,
                `生成前メモ（重視/回避）: ${focusOrAvoid || "なし"}`,
                "まず既存KPIの重複・役割かぶり・不足役割・必要十分性を判断してください。",
                "3〜5件の固定出力は禁止。不足があるときだけ必要最小限を提案してください。",
                "主要な役割が埋まっている場合は no_additional_kpis_needed を返してください。",
                "整理だけ必要で追加不要なら cleanup_only を返してください。",
                "不足がある場合のみ propose_missing_only として不足分だけ提案してください。",
                "不足カテゴリが空なら no_additional_kpis_needed か cleanup_only を優先してください。",
                "JSONスキーマに厳密に従って返してください。"
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

    const normalized = normalizeDecisionPayload(parsed);
    if (!normalized) {
      return sendJson(res, 502, { error: "Model output validation failed" });
    }
    const prioritized = enforceDecisionPriority({
      normalized,
      requestMissingCategories: missingCategories
    });

    return sendJson(res, 200, {
      ...prioritized,
      kpis: prioritized.proposedKpis
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Failed to generate KPI candidates",
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
