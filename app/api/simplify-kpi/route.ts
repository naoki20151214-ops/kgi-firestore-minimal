import { NextResponse } from "next/server";

declare const process: { env: Record<string, string | undefined> };

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはKPIを初心者向けに翻訳する編集者です。
目的:
- 専門的なKPIを、初心者でも分かる表現に変換する

ルール:
1. 専門用語をなるべく使わない
2. 抽象表現を避ける
3. 「何を目指す指標か」が一瞬で分かるようにする
4. できれば行動イメージが浮かぶ表現にする
5. 元の意味は壊さない
6. 日本語で返す
7. JSONのみ返す`;

const RESPONSE_SCHEMA = {
  name: "simplify_kpi_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["simpleName", "simpleDescription"],
    properties: {
      simpleName: { type: "string" },
      simpleDescription: { type: "string" }
    }
  }
} as const;

type SimplifyKpiRequest = {
  name?: unknown;
  description?: unknown;
  type?: unknown;
  targetValue?: unknown;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const buildFallbackResponse = ({ name = "", description = "" }) => ({
  simpleName: isNonEmptyString(name) ? name.trim() : "KPI",
  simpleDescription: isNonEmptyString(description) ? description.trim() : "説明なし"
});

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

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as SimplifyKpiRequest | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const type = body?.type === "action" ? "action" : body?.type === "result" ? "result" : "";
  const targetValue = body?.targetValue ?? null;
  const fallback = buildFallbackResponse({ name, description });

  if (!name || !type) {
    return NextResponse.json({
      error: 'Invalid request body. Expected JSON: { "name": "string", "description": "string", "type": "result" | "action", "targetValue": number | string | null }.'
    }, { status: 400 });
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
              text: JSON.stringify({
                input: {
                  name,
                  description: description || "未設定",
                  type,
                  targetValue
                },
                examples: [
                  {
                    input: {
                      name: "主要機能の実装完了率（%）",
                      description: "要件定義で特定したコアユーザーストーリーに対して実装・レビュー・結合テストを終えた割合",
                      type: "result",
                      targetValue: 100
                    },
                    output: {
                      simpleName: "主要機能がどれだけ完成したか",
                      simpleDescription: "リリースに必要な大事な機能が、どれくらい完成に近づいているかを表します"
                    }
                  },
                  {
                    input: {
                      name: "CI/CDの成功ビルド数（自動テスト通過）",
                      description: "",
                      type: "action",
                      targetValue: 10
                    },
                    output: {
                      simpleName: "テストに通った開発回数",
                      simpleDescription: "コードを直したあとに、ちゃんと動く状態で積み上げられた回数です"
                    }
                  }
                ],
                outputInstruction: "JSONスキーマに厳密に従い、simpleNameとsimpleDescriptionのみ返してください"
              })
            }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            ...RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text().catch(() => "");
      console.error("[simplify-kpi] OpenAI API request failed", {
        status: openAiResponse.status,
        statusText: openAiResponse.statusText,
        body: errorText
      });
      return NextResponse.json({ error: "OpenAI API request failed" }, { status: 502 });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);

    if (!outputText) {
      console.error("[simplify-kpi] Failed to extract JSON text from OpenAI response", { responseData });
      return NextResponse.json({ error: "Failed to parse simplify KPI JSON" }, { status: 500 });
    }

    const parsed = JSON.parse(outputText);

    return NextResponse.json({
      simpleName: isNonEmptyString(parsed?.simpleName) ? parsed.simpleName.trim() : fallback.simpleName,
      simpleDescription: isNonEmptyString(parsed?.simpleDescription) ? parsed.simpleDescription.trim() : fallback.simpleDescription
    });
  } catch (error) {
    console.error("[simplify-kpi] Unexpected error", error);
    return NextResponse.json({ error: "Failed to simplify KPI" }, { status: 500 });
  }
}
