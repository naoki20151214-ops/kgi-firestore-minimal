const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはプロジェクト管理と実行分解の専門家です。
与えられたKGIとKPIから、そのKPIを前に進めるための具体的で実行可能なTaskだけを作成してください。

ルール:
- Taskは行動レベルまで分解する
- 曖昧な表現を避ける
- 大きすぎる目標ではなく、1回で着手できる単位にする
- KPI達成と因果関係のあるTaskにする
- 3〜7件出す
- 日本語で返す
- 出力は必ずJSONのみ
- 各Taskは以下の形式:
  {
    "title": "...",
    "description": "...",
    "type": "one_time",
    "progressValue": 1,
    "priority": 1
  }`;

const TASK_RESPONSE_SCHEMA = {
  name: "generate_tasks_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["tasks"],
    properties: {
      tasks: {
        type: "array",
        minItems: 3,
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "type", "progressValue", "priority"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            type: { type: "string", enum: ["one_time"] },
            progressValue: { type: "integer", enum: [1] },
            priority: { type: "integer", minimum: 1, maximum: 3 }
          }
        }
      }
    }
  }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isValidKpiType = (value) => value === "result" || value === "action";

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

const isValidTaskItem = (value) => {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    isNonEmptyString(value.title)
    && isNonEmptyString(value.description)
    && value.type === "one_time"
    && Number(value.progressValue) === 1
    && Number.isInteger(Number(value.priority))
    && Number(value.priority) >= 1
    && Number(value.priority) <= 3
  );
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
  const kgiName = typeof requestBody?.kgiName === "string" ? requestBody.kgiName.trim() : "";
  const kgiGoalText = typeof requestBody?.kgiGoalText === "string" ? requestBody.kgiGoalText.trim() : "";
  const kpiName = typeof requestBody?.kpiName === "string" ? requestBody.kpiName.trim() : "";
  const kpiDescription = typeof requestBody?.kpiDescription === "string" ? requestBody.kpiDescription.trim() : "";
  const kpiType = requestBody?.kpiType;
  const targetValue = Number(requestBody?.targetValue);

  if (!kgiName || !kpiName || !isValidKpiType(kpiType) || !Number.isFinite(targetValue)) {
    return sendJson(res, 400, {
      error: "Invalid request body. Expected JSON with kgiName, kgiGoalText, kpiName, kpiDescription, kpiType, targetValue."
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
                `KGIゴール説明: ${kgiGoalText || "未設定"}`,
                `KPI名: ${kpiName}`,
                `KPI説明: ${kpiDescription || "未設定"}`,
                `KPIタイプ: ${kpiType}`,
                `KPI目標値: ${targetValue}`,
                "指定のJSONスキーマに厳密に従ってTask候補のみ返してください。"
              ].join("\n")
            }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            ...TASK_RESPONSE_SCHEMA
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
      return sendJson(res, 500, { error: "Failed to parse Task JSON" });
    }

    const parsedResponse = JSON.parse(outputText);

    if (!Array.isArray(parsedResponse?.tasks) || parsedResponse.tasks.length < 3 || parsedResponse.tasks.length > 7 || !parsedResponse.tasks.every(isValidTaskItem)) {
      return sendJson(res, 500, { error: "Failed to parse Task JSON" });
    }

    return sendJson(res, 200, {
      tasks: parsedResponse.tasks.map((task) => ({
        title: task.title.trim(),
        description: task.description.trim(),
        type: "one_time",
        progressValue: 1,
        priority: Number(task.priority)
      }))
    });
  } catch (error) {
    console.error("[generate-tasks] Unexpected server error", error);
    return sendJson(res, 500, { error: "Unexpected server error" });
  }
};
