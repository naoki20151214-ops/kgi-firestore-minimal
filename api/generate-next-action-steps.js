const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたは実行支援の専門家です。
与えられたタスクを、今すぐ始められる小ステップに分解してください。

ルール:
- 1〜3件
- それぞれ短く、具体的に
- 5〜15分で着手できる行動にする
- 曖昧な表現は禁止
- 出力は JSON のみ
- 日本語で返す`;

const STEP_RESPONSE_SCHEMA = {
  name: "generate_next_action_steps_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["steps"],
    properties: {
      steps: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "string"
        }
      }
    }
  }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isValidReflectionResult = (value) => (
  value === "as_planned"
  || value === "harder_than_expected"
  || value === "needs_improvement"
  || value === "could_not_do"
);

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

const normalizeRecentReflections = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const taskTitle = typeof item?.taskTitle === "string" ? item.taskTitle.trim() : "";
      const comment = typeof item?.comment === "string" ? item.comment.trim() : "";
      const result = item?.result;

      if (!taskTitle || !isValidReflectionResult(result)) {
        return null;
      }

      return {
        taskTitle,
        result,
        comment
      };
    })
    .filter(Boolean)
    .slice(0, 5);
};

const buildReflectionGuidance = (recentReflections) => {
  if (!recentReflections.length) {
    return "";
  }

  const summaryLines = recentReflections.map((reflection, index) => {
    const commentText = reflection.comment ? ` / コメント: ${reflection.comment}` : "";
    return `${index + 1}. Task: ${reflection.taskTitle} / 結果: ${reflection.result}${commentText}`;
  });

  const adaptiveRules = new Set();

  recentReflections.forEach((reflection) => {
    if (reflection.result === "harder_than_expected") {
      adaptiveRules.add("- 難しかった履歴があるため、専門用語を減らし、短い説明を補い、ステップをさらに小さく分けること。");
    }

    if (reflection.result === "could_not_do") {
      adaptiveRules.add("- できなかった履歴があるため、難易度を1段下げ、最初の一歩をさらに小さくし、準備から始めること。");
    }

    if (reflection.result === "as_planned") {
      adaptiveRules.add("- 予定通り進められた履歴もあるため、過度に簡単にしすぎず、着手しやすさを維持すること。");
    }

    if (reflection.result === "needs_improvement") {
      adaptiveRules.add("- やり方の見直しが必要だった履歴があるため、順番や構成を改善し、抽象的な表現を減らすこと。");
    }
  });

  return [
    "過去の振り返りから分かっていること:",
    ...summaryLines,
    "",
    "これらを考慮して、次の小ステップ提案では以下を守ること:",
    ...Array.from(adaptiveRules),
    "- 専門用語を避けるか、使う場合は短く意味を添えること。",
    "- より具体的で、今すぐ始められる5〜15分の行動にすること。",
    "- 難しすぎる提案を避け、必要なら準備ステップから始めること。"
  ].join("\n");
};

const sanitizeSteps = (steps) => {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((step) => typeof step === "string" ? step.trim() : "")
    .filter((step) => step.length > 0)
    .slice(0, 3);
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
  const taskTitle = typeof requestBody?.taskTitle === "string" ? requestBody.taskTitle.trim() : "";
  const taskDescription = typeof requestBody?.taskDescription === "string" ? requestBody.taskDescription.trim() : "";
  const kpiName = typeof requestBody?.kpiName === "string" ? requestBody.kpiName.trim() : "";
  const recentReflections = normalizeRecentReflections(requestBody?.recentReflections);
  const reflectionGuidance = buildReflectionGuidance(recentReflections);

  if (!isNonEmptyString(taskTitle) || !isNonEmptyString(kpiName)) {
    return sendJson(res, 400, {
      error: "Invalid request body. Expected JSON with taskTitle, taskDescription, kpiName."
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
                `KPI名: ${kpiName}`,
                `Task名: ${taskTitle}`,
                `Task補足説明: ${taskDescription || "未設定"}`,
                reflectionGuidance,
                "このTaskに今すぐ着手できる小ステップを1〜3件、JSONでのみ返してください。"
              ].filter(Boolean).join("\n")
            }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            ...STEP_RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      return sendJson(res, 502, { error: "OpenAI API request failed" });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);

    if (!outputText) {
      return sendJson(res, 500, { error: "Failed to parse next action step JSON" });
    }

    const parsedResponse = JSON.parse(outputText);
    const steps = sanitizeSteps(parsedResponse?.steps);

    if (steps.length === 0 || steps.length > 3) {
      return sendJson(res, 500, { error: "Failed to parse next action step JSON" });
    }

    return sendJson(res, 200, { steps });
  } catch (error) {
    console.error("[generate-next-action-steps] Unexpected server error", error);
    return sendJson(res, 500, { error: "Unexpected server error" });
  }
};
