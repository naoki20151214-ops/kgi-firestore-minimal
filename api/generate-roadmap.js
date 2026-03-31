const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const LEVEL_RULES = {
  easy: {
    label: "やさしく",
    description: [
      "専門用語を使わない",
      "小学生でも理解できるレベル",
      "『何をするか』を中心に書く",
      "1文は短くする",
      "抽象的な言葉は禁止",
      "行動ベースで書く"
    ]
  },
  normal: {
    label: "ふつう",
    description: [
      "軽く専門用語を使ってよい",
      "ただし説明は入れる",
      "読みやすさを優先する"
    ]
  },
  detailed: {
    label: "くわしく",
    description: [
      "専門用語OK",
      "なぜそれをやるかも説明する",
      "実務レベルの表現にする"
    ]
  }
};

const SYSTEM_PROMPT = `あなたはKGI達成支援アシスタントです。
与えられたKGIについて、KGI説明文と達成までのロードマップを日本語で作成してください。

共通ルール:
- 出力はJSONのみ
- kgiDescription と roadmapPhases 配列で返す
- 各phaseは id, title, description, status を持つ
- status は done / current / next / future のいずれか
- 最初の未着手フェーズを current、その次を next、それ以外を future にする
- まだ開始前として done は原則使わない
- フェーズ数は3〜5件
- 入力の level に応じて表現を変える
- context があれば必ず参照し、誰向け・何を届けるか・媒体・収益化を説明やフェーズに反映する

KGI説明文のルール:
- easy: やさしい言葉だけで、何をするかがすぐ分かる短い説明にする
- normal: 読みやすさを優先しつつ、必要なら用語に短い説明を添える
- detailed: 実務で使える具体性を持たせ、狙いと背景も説明する

ロードマップのルール:
- easy: 各phaseのdescriptionは「やること」を3つ以内の箇条書き風テキストにし、難しい言葉を使わない
- normal: 各phaseのdescriptionは要点と軽い説明が伝わる文章にする
- detailed: 各phaseのdescriptionは実務レベルで詳細に説明する`;

const ROADMAP_RESPONSE_SCHEMA = {
  name: "generate_roadmap_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kgiDescription", "roadmapPhases"],
    properties: {
      kgiDescription: { type: "string" },
      roadmapPhases: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "description", "status"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["done", "current", "next", "future"] }
          }
        }
      }
    }
  }
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

const normalizeRoadmapPhases = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  let currentAssigned = false;
  let nextAssigned = false;

  return value
    .map((phase, index) => {
      const title = typeof phase?.title === "string" ? phase.title.trim() : "";
      const description = typeof phase?.description === "string" ? phase.description.trim() : "";
      let status = typeof phase?.status === "string" ? phase.status.trim() : "future";

      if (status === "done") {
        status = "future";
      }

      if (status === "current") {
        if (currentAssigned) {
          status = nextAssigned ? "future" : "next";
        }
        currentAssigned = true;
      } else if (status === "next") {
        if (nextAssigned) {
          status = "future";
        }
        nextAssigned = true;
      } else {
        status = "future";
      }

      return {
        id: typeof phase?.id === "string" && phase.id.trim() ? phase.id.trim() : `phase_${index + 1}`,
        title: title || `フェーズ${index + 1}`,
        description: description || "進め方の説明はまだありません",
        status
      };
    })
    .filter((phase) => phase.title)
    .slice(0, 5)
    .map((phase, index) => ({ ...phase, id: phase.id || `phase_${index + 1}` }));
};

const ensureRoadmapStatuses = (phases) => {
  const normalized = normalizeRoadmapPhases(phases);

  if (normalized.length === 0) {
    return [];
  }

  if (!normalized.some((phase) => phase.status === "current")) {
    normalized[0].status = "current";
  }

  const currentIndex = normalized.findIndex((phase) => phase.status === "current");
  if (currentIndex >= 0 && !normalized.some((phase, index) => phase.status === "next" && index > currentIndex) && normalized[currentIndex + 1]) {
    normalized[currentIndex + 1].status = "next";
  }

  return normalized.map((phase, index) => {
    if (index < currentIndex && phase.status !== "done") {
      return { ...phase, status: "future" };
    }

    return phase;
  });
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

  const body = getRequestBody(req);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const goalText = typeof body?.goalText === "string" ? body.goalText.trim() : "";
  const deadline = typeof body?.deadline === "string" ? body.deadline.trim() : "";
  const level = typeof body?.level === "string" && Object.prototype.hasOwnProperty.call(LEVEL_RULES, body.level) ? body.level : "normal";
  const context = body?.context && typeof body.context === "object" ? body.context : {};

  if (!name) {
    return sendJson(res, 400, { error: 'Invalid request body. Expected JSON: { "name": "string", "goalText": "string", "deadline": "string" }.' });
  }

  try {
    const promptText = JSON.stringify({
      kgi: {
        name,
        goalText: goalText || "未設定",
        deadline: deadline || "未設定"
      },
      context,
      output: {
        language: "ja",
        phaseCount: "3-5",
        statuses: ["current", "next", "future"],
        level,
        levelLabel: LEVEL_RULES[level].label,
        levelRules: LEVEL_RULES[level].description
      }
    });

    const openAiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: promptText }] }
        ],
        text: {
          format: {
            type: "json_schema",
            name: ROADMAP_RESPONSE_SCHEMA.name,
            schema: ROADMAP_RESPONSE_SCHEMA.schema,
            strict: ROADMAP_RESPONSE_SCHEMA.strict
          }
        }
      })
    });

    const responseJson = await openAiResponse.json();
    const outputText = extractOutputText(responseJson);
    const data = outputText ? JSON.parse(outputText) : null;
    const roadmapPhases = ensureRoadmapStatuses(data?.roadmapPhases);
    const kgiDescription = typeof data?.kgiDescription === "string" && data.kgiDescription.trim()
      ? data.kgiDescription.trim()
      : goalText || `${name}を達成するための説明文です。`;

    if (!openAiResponse.ok || roadmapPhases.length === 0) {
      return sendJson(res, openAiResponse.ok ? 500 : openAiResponse.status, {
        error: responseJson?.error?.message || "ロードマップの生成に失敗しました"
      });
    }

    return sendJson(res, 200, { kgiDescription, roadmapPhases });
  } catch (error) {
    console.error("[generate-roadmap]", error);
    return sendJson(res, 500, { error: "ロードマップの生成に失敗しました" });
  }
};
