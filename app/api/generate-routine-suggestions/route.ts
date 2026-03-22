import { NextResponse } from "next/server";

declare const process: { env: Record<string, string | undefined> };

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MAX_DAILY = 2;
const MAX_WEEKLY = 2;
const MAX_AD_HOC = 2;

const SYSTEM_PROMPT = `あなたはKGI達成支援のための運用ルーティン設計アシスタントです。
目的:
- 今のKGIと現在フェーズに合うルーティン案だけを出す
- daily / weekly / ad_hoc の役割を分ける

ルール:
1. JSONのみ返す
2. daily は0〜2件、weekly は0〜2件、adHoc は1〜2件
3. 汎用的すぎる案は禁止
4. KGI名、現在フェーズ、今やるべきこと、KPI数、Task数、直近の課題メモを踏まえる
5. daily は毎日やる価値があるものだけにする
6. weekly は週次の振り返りや優先度見直しにするが、必ず今フェーズに結びつける
7. adHoc は詰まった時に取る具体的行動にする
8. title は短く、description は1文で具体的にする
9. 「進捗を記録する」「見直す」だけの抽象表現は禁止。何を見て何を判断するかまで書く
10. 同じ内容の言い換えを複数出さない`;

const RESPONSE_SCHEMA = {
  name: "generate_routine_suggestions_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["daily", "weekly", "adHoc"],
    properties: {
      daily: {
        type: "array",
        minItems: 0,
        maxItems: MAX_DAILY,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description"],
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          }
        }
      },
      weekly: {
        type: "array",
        minItems: 0,
        maxItems: MAX_WEEKLY,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description"],
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          }
        }
      },
      adHoc: {
        type: "array",
        minItems: 1,
        maxItems: MAX_AD_HOC,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description"],
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          }
        }
      }
    }
  }
} as const;

type RequestBody = {
  kgiName?: unknown;
  phaseName?: unknown;
  phaseDescription?: unknown;
  nowFocus?: unknown;
  kpiCount?: unknown;
  taskCount?: unknown;
  recentIssues?: unknown;
};

type RoutineItem = { title: string; description: string };

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const extractOutputText = (responseData: any) => {
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

const normalizeFocus = (value: unknown) => Array.isArray(value)
  ? value.filter(isNonEmptyString).map((item) => item.trim()).slice(0, 3)
  : [];

const normalizeRecentIssues = (value: unknown) => Array.isArray(value)
  ? value
    .map((item) => ({
      taskTitle: isNonEmptyString((item as any)?.taskTitle) ? (item as any).taskTitle.trim() : "",
      result: isNonEmptyString((item as any)?.result) ? (item as any).result.trim() : "",
      comment: isNonEmptyString((item as any)?.comment) ? (item as any).comment.trim() : ""
    }))
    .filter((item) => item.taskTitle || item.comment)
    .slice(0, 3)
  : [];

const buildPrompt = (body: RequestBody) => JSON.stringify({
  kgiName: isNonEmptyString(body.kgiName) ? body.kgiName.trim() : "未設定",
  phaseName: isNonEmptyString(body.phaseName) ? body.phaseName.trim() : "未設定",
  phaseDescription: isNonEmptyString(body.phaseDescription) ? body.phaseDescription.trim() : "",
  nowFocus: normalizeFocus(body.nowFocus),
  kpiCount: Number.isFinite(Number(body.kpiCount)) ? Number(body.kpiCount) : 0,
  taskCount: Number.isFinite(Number(body.taskCount)) ? Number(body.taskCount) : 0,
  recentIssues: normalizeRecentIssues(body.recentIssues),
  outputLanguage: "ja"
});

const normalizeRoutineItems = (value: unknown, maxItems: number): RoutineItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((item) => ({
      title: isNonEmptyString((item as any)?.title) ? (item as any).title.trim() : "",
      description: isNonEmptyString((item as any)?.description) ? (item as any).description.trim() : ""
    }))
    .filter((item) => item.title && item.description)
    .filter((item) => {
      const key = `${item.title}__${item.description}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }

  let requestBody: RequestBody;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_RESPONSES_MODEL || "gpt-5-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: buildPrompt(requestBody) }] }
        ],
        text: {
          format: {
            type: "json_schema",
            name: RESPONSE_SCHEMA.name,
            schema: RESPONSE_SCHEMA.schema,
            strict: RESPONSE_SCHEMA.strict
          }
        }
      })
    });

    const responseData = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: extractOutputText(responseData) || "OpenAI API request failed" }, { status: 502 });
    }

    const outputText = extractOutputText(responseData);

    if (!outputText) {
      return NextResponse.json({ error: "OpenAI response was empty" }, { status: 502 });
    }

    const parsed = JSON.parse(outputText);
    const daily = normalizeRoutineItems(parsed?.daily, MAX_DAILY);
    const weekly = normalizeRoutineItems(parsed?.weekly, MAX_WEEKLY);
    const adHoc = normalizeRoutineItems(parsed?.adHoc, MAX_AD_HOC);

    if (adHoc.length === 0) {
      return NextResponse.json({ error: "Routine suggestions were incomplete" }, { status: 502 });
    }

    return NextResponse.json({ daily, weekly, adHoc });
  } catch (error) {
    console.error("[generate-routine-suggestions]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
