import { NextResponse } from "next/server";

declare const process: { env: Record<string, string | undefined> };

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
10. targetValue は現実的な整数にする`;

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
        minItems: 2,
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
} as const;

type RoadmapPhaseStatus = "done" | "current" | "next" | "future";

type RoadmapPhase = {
  id: string;
  title: string;
  description: string;
  status: RoadmapPhaseStatus;
};

type GenerateKpisRequest = {
  kgiName?: unknown;
  kgiGoalText?: unknown;
  roadmapPhases?: unknown;
};

type GeneratedKpi = {
  phaseId: string;
  name: string;
  description: string;
  simpleName: string;
  simpleDescription: string;
  type: "result" | "action";
  targetValue: number;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isValidStatus = (value: unknown): value is RoadmapPhaseStatus => value === "done" || value === "current" || value === "next" || value === "future";

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

const normalizeRoadmapPhases = (value: unknown): RoadmapPhase[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((phase, index) => {
      const id = isNonEmptyString((phase as any)?.id) ? (phase as any).id.trim() : `phase_${index + 1}`;
      const title = isNonEmptyString((phase as any)?.title) ? (phase as any).title.trim() : `フェーズ${index + 1}`;
      const description = isNonEmptyString((phase as any)?.description) ? (phase as any).description.trim() : "このフェーズの説明は未設定です";
      const status = isValidStatus((phase as any)?.status) ? (phase as any).status : "future";

      return { id, title, description, status };
    })
    .filter((phase) => phase.id && phase.title)
    .slice(0, MAX_PHASES);
};

const buildPrompt = ({ kgiName, kgiGoalText, roadmapPhases }: { kgiName: string; kgiGoalText: string; roadmapPhases: RoadmapPhase[] }) => JSON.stringify({
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

const normalizeGeneratedKpis = (value: unknown, phases: RoadmapPhase[]): GeneratedKpi[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const phaseIds = new Set(phases.map((phase) => phase.id));
  const phaseCounts = new Map<string, number>();
  const phaseTypeCounts = new Map<string, { result: number; action: number }>();
  const normalized: GeneratedKpi[] = [];

  value.forEach((item) => {
    const phaseId = isNonEmptyString((item as any)?.phaseId) ? (item as any).phaseId.trim() : "";
    const name = isNonEmptyString((item as any)?.name) ? (item as any).name.trim() : "";
    const description = isNonEmptyString((item as any)?.description) ? (item as any).description.trim() : "";
    const simpleName = isNonEmptyString((item as any)?.simpleName) ? (item as any).simpleName.trim() : name;
    const simpleDescription = isNonEmptyString((item as any)?.simpleDescription) ? (item as any).simpleDescription.trim() : description;
    const type = (item as any)?.type === "action" ? "action" : (item as any)?.type === "result" ? "result" : "";
    const targetValue = Number((item as any)?.targetValue);

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

  if (!hasMinimumBalance) {
    return [];
  }

  return normalized.slice(0, MAX_KPIS);
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as GenerateKpisRequest | null;
  const kgiName = isNonEmptyString(body?.kgiName) ? body.kgiName.trim() : "";
  const kgiGoalText = isNonEmptyString(body?.kgiGoalText) ? body.kgiGoalText.trim() : "";
  const roadmapPhases = normalizeRoadmapPhases(body?.roadmapPhases);

  if (!kgiName || roadmapPhases.length === 0) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
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
    const outputText = extractOutputText(responseJson);
    const data = outputText ? JSON.parse(outputText) : null;
    const kpis = normalizeGeneratedKpis(data?.kpis, roadmapPhases);

    if (!response.ok || kpis.length === 0) {
      return NextResponse.json({ error: responseJson?.error?.message || "ロードマップからのKPI生成に失敗しました" }, { status: response.ok ? 500 : response.status });
    }

    return NextResponse.json({ kpis });
  } catch (error) {
    console.error("[generate-kpis-from-roadmap]", error);
    return NextResponse.json({ error: "ロードマップからのKPI生成に失敗しました" }, { status: 500 });
  }
}
