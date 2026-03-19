const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたは実行支援の専門家です。
与えられたタスクを、今すぐやる小ステップ3件に分解してください。

最重要ルール:
- 返す件数は必ず3件ちょうど
- 各ステップは1文のみ
- 各ステップは5〜10分以内で着手できる行動にする
- 1ステップにつき1行動だけを書く
- 専門用語、カタカナ語、略語はなるべく避ける
- 抽象表現は避け、手を動かす行動にする
- 「考える」「整理する」「確認する」だけで終わらせない
- 1件目は最初の一歩、2件目は準備、3件目は実行に近い行動にする
- 必要なら短い補足を丸かっこで入れてよい
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
        minItems: 3,
        maxItems: 3,
        items: {
          type: "string"
        }
      }
    }
  }
};

const COMMENT_DIFFICULTY_KEYWORDS = ["難しい", "分からない", "わからない", "専門用語", "大変"];
const MAX_ADAPTATION_HINTS = 5;
const STEP_LABELS = ["まずやる", "次にやる", "その次"];
const ABSTRACT_STEP_PATTERNS = ["整理", "検討", "確認", "見直", "考え", "把握", "対応", "準備", "相談", "共有", "調整", "分析", "設計", "改善", "最適化"];
const CONCRETE_STEP_PATTERNS = ["ファイル", "表", "一覧", "URL", "件", "行", "列", "項目", "メモ", "下書き", "タイトル", "数字", "社", "人", "回", "つ", "画面", "シート", "手順", "期限", "担当", "リンク"];
const FALLBACK_STEPS = [
  "Taskの内容を1回読み、最初に触る対象を1つ決める",
  "必要な作業を3つの短い行動に分けて1行ずつメモする",
  "分けた作業の1件目を5分だけ進める"
];

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

const isCommentDifficult = (comment) => COMMENT_DIFFICULTY_KEYWORDS.some((keyword) => comment.includes(keyword));

const buildAdaptationHints = (recentReflections) => {
  const hintSet = new Set();

  recentReflections.forEach((reflection) => {
    const comment = typeof reflection?.comment === "string" ? reflection.comment.trim() : "";
    const result = reflection?.result;
    const hasDifficultySignal = result === "harder_than_expected" || isCommentDifficult(comment);

    if (hasDifficultySignal) {
      hintSet.add("専門用語を減らす");
      hintSet.add("小さなステップに分ける");
      hintSet.add("説明を増やす");
    }

    if (result === "could_not_do") {
      hintSet.add("準備タスクから始める");
      hintSet.add("一度に要求する作業量を減らす");
    }

    if (result === "needs_improvement") {
      hintSet.add("順番を明確にする");
      hintSet.add("曖昧な表現を避ける");
    }
  });

  return Array.from(hintSet).slice(0, MAX_ADAPTATION_HINTS);
};

const compressTaskDescription = (taskDescription) => {
  if (!isNonEmptyString(taskDescription)) {
    return "未設定";
  }

  return taskDescription
    .replace(/\s+/g, " ")
    .split(/(?<=[。.!?])\s+/)
    .slice(0, 2)
    .join(" ")
    .slice(0, 140)
    .trim();
};

const buildAdaptationPromptLines = (adaptationHints) => {
  if (!Array.isArray(adaptationHints) || adaptationHints.length === 0) {
    return [];
  }

  const hintMap = {
    "専門用語を減らす": "専門用語・カタカナ語・略語を減らし、必要なら短い言い換えを入れる",
    "小さなステップに分ける": "各ステップをさらに細かくし、1ステップ1行動に限定する",
    "説明を増やす": "1文の中に短い補足を入れて、迷わず動ける形にする",
    "準備タスクから始める": "いきなり本作業に入らず、最初は準備タスクから始める",
    "一度に要求する作業量を減らす": "最初に扱う件数や量を減らし、小さく始める",
    "順番を明確にする": "迷わない順序にして、最初の一歩をいちばん簡単にする",
    "曖昧な表現を避ける": "抽象語を避け、対象・件数・項目を入れて具体化する"
  };

  return adaptationHints
    .map((hint) => hintMap[hint])
    .filter(Boolean);
};

const buildStepPrompt = ({ kpiName, taskTitle, taskDescription, adaptationHints }) => {
  const compactTaskDescription = compressTaskDescription(taskDescription);
  const adaptationPromptLines = buildAdaptationPromptLines(adaptationHints);

  return [
    `KPI名: ${kpiName}`,
    `Task名: ${taskTitle}`,
    `Task補足説明(重要部分のみ): ${compactTaskDescription}`,
    adaptationPromptLines.length > 0
      ? `振り返り反映ルール:\n- ${adaptationPromptLines.join("\n- ")}`
      : "",
    "今すぐやる小ステップを3件ちょうど、JSONのみで返してください。"
  ].filter(Boolean).join("\n");
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

const removeJsonCodeFence = (value) => typeof value === "string"
  ? value.replace(/```json\s*/gi, "").replace(/```/g, "").trim()
  : "";

const extractJsonObjectString = (value) => {
  const sanitized = removeJsonCodeFence(value);
  const firstBraceIndex = sanitized.indexOf("{");
  const lastBraceIndex = sanitized.lastIndexOf("}");

  if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex < firstBraceIndex) {
    return "";
  }

  return sanitized.slice(firstBraceIndex, lastBraceIndex + 1);
};

const sanitizeSteps = (steps) => {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((step) => typeof step === "string" ? step.replace(/\s+/g, " ").trim() : "")
    .filter((step) => step.length > 0)
    .slice(0, 3);
};

const normalizeStepText = (step) => typeof step === "string" ? step.replace(/^（?(まずやる|次にやる|その次)[:：]\s*/, "").trim() : "";

const shortenStepText = (step) => {
  const normalized = normalizeStepText(step).replace(/[。.!?]+$/g, "").trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= 80) {
    return normalized;
  }

  const compact = normalized
    .replace(/、[^、]{16,}$/, "")
    .replace(/（[^）]{20,}）/g, "")
    .trim();

  return compact.slice(0, 80).trim();
};

const ensureConcreteStep = (step, index) => {
  const shortened = shortenStepText(step);
  const normalized = normalizeStepText(shortened);
  const hasConcreteToken = CONCRETE_STEP_PATTERNS.some((pattern) => normalized.includes(pattern)) || /\d/.test(normalized);

  if (!normalized) {
    return FALLBACK_STEPS[index] || FALLBACK_STEPS[FALLBACK_STEPS.length - 1];
  }

  if (hasConcreteToken) {
    return normalized;
  }

  if (index === 0) {
    return `${normalized}対象を1つ決めてメモする`;
  }

  if (index === 1) {
    return `${normalized}ための項目を3つ書く`;
  }

  return `${normalized}結果を1行メモする`;
};

const isAbstractStep = (step) => {
  const normalized = normalizeStepText(step);
  if (!normalized) {
    return true;
  }

  const matchedAbstract = ABSTRACT_STEP_PATTERNS.some((pattern) => normalized.includes(pattern));
  const hasConcreteToken = CONCRETE_STEP_PATTERNS.some((pattern) => normalized.includes(pattern)) || /\d/.test(normalized);
  return matchedAbstract && !hasConcreteToken;
};

const addStepLabels = (steps) => steps.map((step, index) => `${STEP_LABELS[index] || `手順${index + 1}`}：${ensureConcreteStep(step, index)}`);

const hasLowQualitySteps = (steps) => {
  const normalized = steps.map((step) => normalizeStepText(step)).filter(Boolean);

  if (normalized.length !== 3) {
    return true;
  }

  const tooLong = normalized.some((step) => step.length > 80);
  const tooAbstractCount = normalized.filter((step) => isAbstractStep(step)).length;
  const duplicateRoots = new Set(normalized.map((step) => step.replace(/[0-9０-９]/g, "").slice(0, 12)));
  const lacksConcreteTarget = normalized.filter((step) => CONCRETE_STEP_PATTERNS.some((pattern) => step.includes(pattern)) || /\d/.test(step)).length === 0;

  return tooLong || tooAbstractCount >= 2 || duplicateRoots.size <= 1 || lacksConcreteTarget;
};

const reshapeSteps = (steps) => addStepLabels(steps.map((step, index) => ensureConcreteStep(step, index))).slice(0, 3);

const isSameStepSet = (steps) => steps.length === FALLBACK_STEPS.length && steps.every((step, index) => normalizeStepText(step) === FALLBACK_STEPS[index]);

const buildFallbackSteps = (taskTitle) => {
  const normalizedTitle = typeof taskTitle === "string" ? taskTitle.trim().toLowerCase() : "";

  if (/(qa|テスト|試験|検証)/i.test(normalizedTitle)) {
    return [
      "まずやる：テスト対象を1件だけ決めて開く",
      "次にやる：再現手順を1回だけ試す",
      "その次：結果を1行メモする"
    ];
  }

  if (/(pr|実装|修正|開発)/i.test(normalizedTitle)) {
    return [
      "まずやる：対象ファイルを1つ開く",
      "次にやる：直す内容を1行でメモする",
      "その次：最初の修正を1つ入れる"
    ];
  }

  if (/(営業|顧客|商談|リード)/i.test(normalizedTitle)) {
    return [
      "まずやる：候補を5件だけ集める",
      "次にやる：候補を一覧に貼り付ける",
      "その次：1件だけ送る文を作る"
    ];
  }

  return addStepLabels(FALLBACK_STEPS);
};

const getFallbackResult = (reason, taskTitle = "") => {
  console.warn("[generate-next-action-steps] fallback enabled", {
    endpoint: "generate-next-action-steps",
    reason,
    usedFallback: true,
    returnedStepsCount: 3
  });

  return {
    steps: buildFallbackSteps(taskTitle),
    usedFallback: true,
    reason
  };
};

const parseStepsFromOutputText = (outputText, taskTitle = "") => {
  console.log("[generate-next-action-steps] raw response status", {
    endpoint: "generate-next-action-steps",
    hasRawResponse: Boolean(outputText && outputText.trim())
  });

  if (!outputText || !outputText.trim()) {
    console.log("[generate-next-action-steps] parse result", { endpoint: "generate-next-action-steps", parseSucceeded: false, reason: "empty_response" });
    return getFallbackResult("empty_response", taskTitle);
  }

  const jsonText = extractJsonObjectString(outputText);

  if (!jsonText) {
    console.log("[generate-next-action-steps] parse result", { endpoint: "generate-next-action-steps", parseSucceeded: false, reason: "json_not_found" });
    return getFallbackResult("json_not_found", taskTitle);
  }

  try {
    const parsedResponse = JSON.parse(jsonText);
    const steps = sanitizeSteps(parsedResponse?.steps);

    if (steps.length === 0) {
      console.log("[generate-next-action-steps] parse result", { endpoint: "generate-next-action-steps", parseSucceeded: false, reason: "steps_missing_or_empty" });
      return getFallbackResult("steps_missing_or_empty", taskTitle);
    }

    const reshapedSteps = reshapeSteps(steps);
    const needsReshape = hasLowQualitySteps(steps);
    const finalSteps = needsReshape ? reshapedSteps : addStepLabels(steps);

    console.log("[generate-next-action-steps] parse result", { endpoint: "generate-next-action-steps", parseSucceeded: true, reason: needsReshape ? "reshaped" : "ok" });
    return {
      steps: finalSteps,
      usedFallback: isSameStepSet(finalSteps),
      reason: needsReshape ? "reshaped" : "ok"
    };
  } catch (error) {
    console.error("[generate-next-action-steps] parse error", {
      endpoint: "generate-next-action-steps",
      parseSucceeded: false,
      reason: "json_parse_error",
      error
    });
    return getFallbackResult("json_parse_error", taskTitle);
  }
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
  const adaptationHints = buildAdaptationHints(recentReflections);

  if (!requestBody) {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  if (!isNonEmptyString(taskTitle) || !isNonEmptyString(kpiName)) {
    return sendJson(res, 400, {
      error: "Invalid request body. Expected JSON with taskTitle, taskDescription, kpiName."
    });
  }

  try {
    const promptText = buildStepPrompt({
      kpiName,
      taskTitle,
      taskDescription,
      adaptationHints
    });
    console.log("[generate-next-action-steps] request", {
      endpoint: "generate-next-action-steps",
      rawInputPayload: {
        taskTitle,
        taskDescription,
        kpiName,
        recentReflections
      },
      rawReflectionsCount: recentReflections.length,
      adaptationHints,
      adaptationHintsCount: adaptationHints.length,
      promptChars: SYSTEM_PROMPT.length + promptText.length
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
          {
            role: "system",
            content: [{ type: "input_text", text: SYSTEM_PROMPT }]
          },
          {
            role: "user",
            content: [{
              type: "input_text",
              text: promptText
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
      console.error("[generate-next-action-steps] upstream error", {
        endpoint: "generate-next-action-steps",
        status: openAiResponse.status,
        rawInputPayload: {
          taskTitle,
          taskDescription,
          kpiName,
          recentReflections
        }
      });
      const fallback = getFallbackResult(`upstream_status_${openAiResponse.status}`, taskTitle);
      console.log("[generate-next-action-steps] response", {
        endpoint: "generate-next-action-steps",
        parseSucceeded: false,
        usedFallback: fallback.usedFallback,
        returnedStepsCount: fallback.steps.length
      });
      return sendJson(res, 200, { steps: fallback.steps });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);
    const parsed = parseStepsFromOutputText(outputText, taskTitle);

    console.log("[generate-next-action-steps] response", {
      endpoint: "generate-next-action-steps",
      parseSucceeded: parsed.reason === "ok" || parsed.reason === "reshaped",
      usedFallback: parsed.usedFallback,
      returnedStepsCount: parsed.steps.length
    });
    return sendJson(res, 200, { steps: parsed.steps });
  } catch (error) {
    console.error("[generate-next-action-steps] unexpected error", {
      endpoint: "generate-next-action-steps",
      error
    });
    const fallback = getFallbackResult("unexpected_server_error", taskTitle);
    console.log("[generate-next-action-steps] response", {
      endpoint: "generate-next-action-steps",
      parseSucceeded: false,
      usedFallback: fallback.usedFallback,
      returnedStepsCount: fallback.steps.length
    });
    return sendJson(res, 200, { steps: fallback.steps });
  }
};
