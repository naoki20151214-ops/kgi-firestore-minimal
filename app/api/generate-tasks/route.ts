import { NextResponse } from "next/server";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `あなたはPDCAアプリのTask生成AIです。KGI全体・全KPI・対象KPI・既存Taskを踏まえ、対象KPIに必要なTaskを日本語JSONのみで返してください。

最重要ルール:
- 役割の異なるTaskを最大3件返す（重複する場合は3件未満でもよい）
- すべて「今すぐ着手する最小の次の一歩」にする
- 30分〜2時間以内に着手・完了しやすい粒度を優先する
- KPIごとに最低1つは「Next Action」としてそのまま使えるTaskを含める
- 先頭のTaskは5分以内に着手できる、1ステップで完結する具体行動にする
- 抽象表現は禁止（例: 調査する、戦略を考える）
- 良い例: 競合記事を3つ開く / 読者候補1人にDM送る / noteのタイトルを1つ書く
- titleは短い行動文、descriptionは1行の補足説明にする
- stage は必ず setup / research / decision / build / launch / review のいずれかを入れる（迷う場合は build を返す）
- Taskはすべて対象KPIに直接つながる内容にする
- 他KPIと重複するTask名や内容は避ける
- 既存Taskと同じ内容は絶対に出さない
- 既存Taskの言い換えも絶対に出さない
- 完了済みTaskと意味的に近い内容も絶対に出さない
- すでに進行中の作業を繰り返さない
- まだ存在しない未着手の穴だけを出す
- 同じ作業の分解版を何度も出さない
- 直近完了Taskと同じカテゴリ（要件整理 / 計測設計 / テスト設計 / 実装 / 公開準備 / ユーザー検証 / 分析振り返り）の深掘りを続けない
- 可能な限り未着手の別カテゴリから候補を出す
- 同カテゴリしか候補がない場合は、1段だけ前進する最小Taskを1件だけ出してよい
- フェーズ目的と期限に沿って自然な順序にする
- 1人開発前提で、外部チーム前提の会議・依頼・担当者アサイン・Slack共有依頼は禁止
- 未作成の資料・未整備の体制を前提にしない
- 初期段階で不要な管理表・運用設計・過度に細かい分析運用は禁止
- 「まず確認する」「まず1つ作る」「まず定義する」レベルを優先する`;

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
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "stage", "type", "progressValue", "priority"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            stage: { type: "string", enum: ["setup", "research", "decision", "build", "launch", "review"] },
            type: { type: "string", enum: ["one_time"] },
            progressValue: { type: "integer", enum: [1] },
            priority: { type: "integer", minimum: 1, maximum: 3 }
          }
        }
      }
    }
  }
} as const;

type ReflectionResult = "as_planned" | "harder_than_expected" | "needs_improvement" | "could_not_do";

type RecentReflection = {
  taskTitle?: unknown;
  result?: unknown;
  comment?: unknown;
};

type TaskRequest = {
  kgiId?: string;
  kgiName?: string;
  goalDescription?: string;
  kpiId?: string;
  phaseId?: string;
  roadmapPhases?: unknown[];
  targetPhase?: Record<string, unknown> | null;
  allKpis?: unknown[];
  targetKpi?: Record<string, unknown> | null;
  existingTasksForTargetKpi?: unknown[];
  targetDate?: string;
  phaseDeadline?: string;
  recentReflections?: RecentReflection[];
};

type TaskStage = "setup" | "research" | "decision" | "build" | "launch" | "review";

type TaskItem = {
  title?: unknown;
  text?: unknown;
  kpi?: unknown;
  description?: unknown;
  stage?: unknown;
  type?: unknown;
  progressValue?: unknown;
  priority?: unknown;
  status?: unknown;
  dependsOnTaskIds?: unknown;
};

type NormalizedTask = {
  title: string;
  description: string;
  stage: TaskStage;
  type: "one_time";
  progressValue: 1;
  priority: number;
  status: "todo";
  dependsOnTaskIds: string[];
};

type SimilarityComparableTask = {
  title: string;
  description: string;
  status?: string;
  isCompleted?: boolean;
  completedAtUnix?: number;
};

type TaskCategory =
  | "requirements"
  | "measurement"
  | "test"
  | "implementation"
  | "launch_prep"
  | "user_validation"
  | "analysis";

type NormalizedReflection = {
  taskTitle: string;
  result: ReflectionResult;
  comment: string;
};

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

const extractStructuredOutput = (responseData: any) => {
  if (responseData?.output_parsed && typeof responseData.output_parsed === "object") {
    return responseData.output_parsed;
  }

  if (!Array.isArray(responseData?.output)) {
    return null;
  }

  for (const outputItem of responseData.output) {
    if (!Array.isArray(outputItem?.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if ((contentItem?.type === "output_json" || contentItem?.type === "json_schema") && contentItem.json && typeof contentItem.json === "object") {
        return contentItem.json;
      }

      if (contentItem?.parsed && typeof contentItem.parsed === "object") {
        return contentItem.parsed;
      }
    }
  }

  return null;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isValidReflectionResult = (value: unknown): value is ReflectionResult => (
  value === "as_planned"
  || value === "harder_than_expected"
  || value === "needs_improvement"
  || value === "could_not_do"
);

const normalizeRecentReflections = (value: unknown): NormalizedReflection[] => {
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
    .filter((item): item is NormalizedReflection => Boolean(item))
    .slice(0, 5);
};

const COMMENT_DIFFICULTY_KEYWORDS = ["難しい", "分からない", "わからない", "専門用語", "大変"];
const MAX_ADAPTATION_HINTS = 5;

const isCommentDifficult = (comment: string) => COMMENT_DIFFICULTY_KEYWORDS.some((keyword) => comment.includes(keyword));

const buildAdaptationHints = (recentReflections: NormalizedReflection[]) => {
  const hintSet = new Set<string>();

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

const buildTaskPrompt = ({
  kgiName,
  goalDescription,
  roadmapPhases,
  targetPhase,
  allKpis,
  targetKpi,
  existingTasksForTargetKpi,
  targetDate,
  phaseDeadline,
  adaptationHints,
  
}: {
  kgiName: string;
  goalDescription: string;
  roadmapPhases: unknown[];
  targetPhase: Record<string, unknown> | null;
  allKpis: unknown[];
  targetKpi: Record<string, unknown> | null;
  existingTasksForTargetKpi: unknown[];
  targetDate: string;
  phaseDeadline: string;
  adaptationHints: string[];
}) => JSON.stringify({
  kgiName,
  goalDescription: goalDescription || "未設定",
  roadmapPhases,
  targetPhase,
  allKpis,
  targetKpi,
  existingTasksForTargetKpi,
  targetDate,
  phaseDeadline,
  adaptationHints,
  output: {
    tasks: "最大3件（重複除外後は0-3件可）",
    language: "ja",
    type: "one_time",
    progressValue: 1,
    priorityRange: [1, 3],
    taskCountRule: "Return up to 3 tasks. Do not force 3 when valid non-duplicate ideas are fewer.",
    stageRule: "Every task must include stage and it must be one of: setup, research, decision, build, launch, review. If unsure, use build.",
    firstTaskRule: "The first task must be usable as the immediate Next Action.",
    descriptionRule: "Each description must explain the concrete action in one line.",
    duplicationRule: "Avoid semantic duplicates with active/todo/completed tasks. Avoid consecutive deep-dives in the same work category."
  }
});

const TASK_STAGES: TaskStage[] = ["setup", "research", "decision", "build", "launch", "review"];
const normalizeTaskStage = (stage: unknown): TaskStage => {
  const normalized = typeof stage === "string" ? stage.trim().toLowerCase() : "";
  return TASK_STAGES.includes(normalized as TaskStage) ? normalized as TaskStage : "build";
};

const FALLBACK_TASK_TITLE = "最初の一歩を決める";
const FALLBACK_TASK_DESCRIPTION = "KPI達成に向けて、最初に着手する具体的な作業を1つ決めて実行する。";

const normalizeTaskTitle = (value: unknown, index: number, fallbacks: unknown[] = []) => {
  if (isNonEmptyString(value)) {
    return value.trim();
  }

  for (const fallback of fallbacks) {
    if (isNonEmptyString(fallback)) {
      return fallback.trim();
    }
  }

  return index === 0 ? FALLBACK_TASK_TITLE : `補完Task ${index + 1}`;
};

const normalizeTaskDescription = (value: unknown, title: string) => {
  if (isNonEmptyString(value)) {
    return value.trim();
  }

  return `${title} を安全に進めるための補完Taskです。`;
};

const normalizeTaskPriority = (value: unknown) => {
  const priority = Number(value);

  if (!Number.isFinite(priority) || priority < 0) {
    return 0;
  }

  if (priority > 3) {
    return 3;
  }

  return Math.trunc(priority);
};

const TASK_STOPWORDS = new Set([
  "する", "した", "して", "します", "できる", "ため", "こと", "もの", "よう", "まず", "今回", "について",
  "作成", "作る", "書く", "記入", "入力", "追加", "確認", "実施", "対応", "設定", "作業", "タスク"
]);
const TASK_VERB_SYNONYMS: Record<string, string> = {
  作成: "作る",
  作る: "作る",
  書く: "書く",
  記入: "書く",
  入力: "書く",
  定義: "決める",
  決定: "決める",
  決める: "決める",
  確認: "確認",
  チェック: "確認"
};

const TASK_CATEGORY_KEYWORDS: Record<TaskCategory, string[]> = {
  requirements: ["要件", "受け入れ", "仕様", "範囲", "mvp", "ユーザーストーリー", "課題", "前提"],
  measurement: ["計測", "イベント", "トラッキング", "kpi", "指標", "ga", "分析基盤", "コンバージョン"],
  test: ["テスト", "検証項目", "シナリオ", "qa", "不具合", "テストケース", "受入試験"],
  implementation: ["実装", "開発", "コード", "api", "画面", "db", "修正", "作成"],
  launch_prep: ["公開", "リリース", "配信", "申請", "ストア", "デプロイ", "告知", "リハーサル"],
  user_validation: ["ユーザー", "インタビュー", "ヒアリング", "フィードバック", "利用", "観察", "体験"],
  analysis: ["振り返り", "分析", "レポート", "改善", "学び", "要因", "結果", "比較"]
};

const CATEGORY_ORDER: TaskCategory[] = [
  "requirements",
  "measurement",
  "test",
  "implementation",
  "launch_prep",
  "user_validation",
  "analysis"
];

const normalizeTaskText = (value: unknown) => {
  if (!isNonEmptyString(value)) {
    return "";
  }
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[0-9]+/g, "#")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenizeTaskText = (value: unknown) => {
  const normalized = normalizeTaskText(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(" ")
    .map((token) => TASK_VERB_SYNONYMS[token] ?? token)
    .filter((token) => token.length >= 2 && !TASK_STOPWORDS.has(token));
};

const buildCharacterNgrams = (value: string, size = 2) => {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < size) {
    return new Set<string>(compact ? [compact] : []);
  }
  const grams = new Set<string>();
  for (let index = 0; index <= compact.length - size; index += 1) {
    grams.add(compact.slice(index, index + size));
  }
  return grams;
};

const inferTaskCategory = (task: SimilarityComparableTask) => {
  const normalized = normalizeTaskText(`${task.title} ${task.description}`);
  if (!normalized) {
    return "implementation" as TaskCategory;
  }

  let bestCategory: TaskCategory = "implementation";
  let bestScore = -1;

  CATEGORY_ORDER.forEach((category) => {
    const score = TASK_CATEGORY_KEYWORDS[category].reduce((acc, keyword) => (
      normalized.includes(keyword.toLowerCase()) ? acc + 1 : acc
    ), 0);

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  });

  return bestCategory;
};

const isSameCategory = (left: SimilarityComparableTask, right: SimilarityComparableTask) => (
  inferTaskCategory(left) === inferTaskCategory(right)
);

const toSimilaritySignature = (task: SimilarityComparableTask) => {
  const normalizedTitle = normalizeTaskText(task.title);
  const combined = normalizeTaskText(`${task.title} ${task.description}`);
  const titleTokens = new Set(tokenizeTaskText(task.title));
  const combinedTokens = new Set(tokenizeTaskText(`${task.title} ${task.description}`));
  return { normalizedTitle, combined, titleTokens, combinedTokens };
};

const calcTokenOverlap = (left: Set<string>, right: Set<string>) => {
  if (!left.size || !right.size) {
    return 0;
  }
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) {
      intersection += 1;
    }
  });
  return intersection / Math.max(left.size, right.size);
};

const calcNgramOverlap = (leftText: string, rightText: string) => {
  const left = buildCharacterNgrams(leftText);
  const right = buildCharacterNgrams(rightText);
  return calcTokenOverlap(left, right);
};

const isSimilarTask = (a: SimilarityComparableTask, b: SimilarityComparableTask) => {
  const sigA = toSimilaritySignature(a);
  const sigB = toSimilaritySignature(b);
  if (!sigA.combined || !sigB.combined) {
    return false;
  }
  if (sigA.normalizedTitle === sigB.normalizedTitle) {
    return true;
  }
  if (sigA.combined === sigB.combined) {
    return true;
  }
  if (sigA.combined.includes(sigB.normalizedTitle) || sigB.combined.includes(sigA.normalizedTitle)) {
    return true;
  }
  const titleOverlap = calcTokenOverlap(sigA.titleTokens, sigB.titleTokens);
  if (titleOverlap >= 0.8) {
    return true;
  }
  const combinedOverlap = calcTokenOverlap(sigA.combinedTokens, sigB.combinedTokens);
  return combinedOverlap >= 0.72;
};

const isSemanticallyTooClose = (candidate: SimilarityComparableTask, existing: SimilarityComparableTask) => {
  if (isSimilarTask(candidate, existing)) {
    return true;
  }

  if (!isSameCategory(candidate, existing)) {
    return false;
  }

  const candidateCombined = normalizeTaskText(`${candidate.title} ${candidate.description}`);
  const existingCombined = normalizeTaskText(`${existing.title} ${existing.description}`);
  if (!candidateCombined || !existingCombined) {
    return false;
  }

  const ngramOverlap = calcNgramOverlap(candidateCombined, existingCombined);
  if (ngramOverlap >= 0.52) {
    return true;
  }

  const candidateTitle = normalizeTaskText(candidate.title);
  const existingTitle = normalizeTaskText(existing.title);
  return calcNgramOverlap(candidateTitle, existingTitle) >= 0.58;
};

const extractUnixTime = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === "object" && Number.isFinite((value as any).seconds)) {
    return Number((value as any).seconds) * 1000;
  }

  return 0;
};

const toComparableTask = (task: any, index: number): SimilarityComparableTask => ({
  title: isNonEmptyString(task?.title) ? task.title.trim() : "",
  description: isNonEmptyString(task?.description) ? task.description.trim() : "",
  status: isNonEmptyString(task?.status) ? task.status.trim().toLowerCase() : "",
  isCompleted: Boolean(task?.isCompleted),
  completedAtUnix: extractUnixTime(task?.completedAt ?? task?.doneAt ?? task?.updatedAt ?? task?.createdAt) || index + 1
});

const getRecentCompletedCategories = (existingTasks: SimilarityComparableTask[]) => existingTasks
  .filter((task) => task.isCompleted || task.status === "completed" || task.status === "done")
  .sort((a, b) => (b.completedAtUnix ?? 0) - (a.completedAtUnix ?? 0))
  .slice(0, 2)
  .map((task) => inferTaskCategory(task));

const filterRecentlyCompletedCategory = (candidates: NormalizedTask[], existingTasks: SimilarityComparableTask[]) => {
  const recentCategories = getRecentCompletedCategories(existingTasks);
  if (recentCategories.length === 0) {
    return { preferred: candidates, deferred: [] as NormalizedTask[] };
  }

  const blockedCategory = recentCategories.length >= 2 && recentCategories[0] === recentCategories[1]
    ? recentCategories[0]
    : null;
  const recentCategorySet = new Set(recentCategories);
  const preferred: NormalizedTask[] = [];
  const deferred: NormalizedTask[] = [];

  candidates.forEach((candidate) => {
    const category = inferTaskCategory(candidate);

    if (blockedCategory && category === blockedCategory) {
      return;
    }

    if (recentCategorySet.has(category)) {
      deferred.push(candidate);
      return;
    }

    preferred.push(candidate);
  });

  return { preferred, deferred };
};

const rankCandidatesByCategoryDiversity = (candidates: NormalizedTask[]) => {
  const usedCategories = new Set<TaskCategory>();
  const ranked: NormalizedTask[] = [];

  candidates.forEach((candidate) => {
    const category = inferTaskCategory(candidate);
    if (!usedCategories.has(category)) {
      ranked.push(candidate);
      usedCategories.add(category);
    }
  });

  candidates.forEach((candidate) => {
    if (!ranked.includes(candidate)) {
      ranked.push(candidate);
    }
  });

  return ranked;
};

const filterDuplicateCandidates = (candidates: NormalizedTask[], existingTasks: SimilarityComparableTask[]) => {
  const unique: NormalizedTask[] = [];
  for (const candidate of candidates) {
    const duplicateWithExisting = existingTasks.some((task) => isSemanticallyTooClose(candidate, task));
    if (duplicateWithExisting) {
      continue;
    }

    const duplicateInCandidates = unique.some((task) => isSemanticallyTooClose(candidate, task));
    if (duplicateInCandidates) {
      continue;
    }

    unique.push(candidate);
  }
  return unique;
};

const normalizeDependsOnTaskIds = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const normalizeTaskItem = (value: TaskItem, index: number): NormalizedTask => {
  const title = normalizeTaskTitle(value?.title, index, [value?.kpi, value?.text]);

  return {
    title,
    description: normalizeTaskDescription(value?.description, title),
    stage: normalizeTaskStage(value?.stage),
    type: "one_time",
    progressValue: 1,
    priority: normalizeTaskPriority(value?.priority),
    status: "todo",
    dependsOnTaskIds: normalizeDependsOnTaskIds(value?.dependsOnTaskIds)
  };
};

const buildFallbackTasks = (taskTitle = FALLBACK_TASK_TITLE): NormalizedTask[] => [{
  title: isNonEmptyString(taskTitle) ? taskTitle.trim() : FALLBACK_TASK_TITLE,
  description: FALLBACK_TASK_DESCRIPTION,
  stage: "build",
  type: "one_time",
  progressValue: 1,
  priority: 0,
  status: "todo",
  dependsOnTaskIds: []
}];

const getTaskItemsFromParsedResponse = (parsed: unknown): TaskItem[] => {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const record = parsed as {
    tasks?: unknown;
    items?: unknown;
    data?: { tasks?: unknown; items?: unknown };
  };

  if (Array.isArray(record.tasks)) {
    return record.tasks;
  }

  if (Array.isArray(record.items)) {
    return record.items;
  }

  if (Array.isArray(record.data?.tasks)) {
    return record.data.tasks;
  }

  if (Array.isArray(record.data?.items)) {
    return record.data.items;
  }

  return [];
};

const safeParseTasks = (rawOutput: unknown, kpiName: string) => {
  if (!rawOutput) {
    console.error("[generate-tasks] empty output payload, using fallback", { kpiName });
    return buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`);
  }

  try {
    const parsed = typeof rawOutput === "string" ? JSON.parse(rawOutput) as unknown : rawOutput;
    const taskItems = getTaskItemsFromParsedResponse(parsed);

    if (!Array.isArray(taskItems) || taskItems.length === 0) {
      console.error("[generate-tasks] tasks missing or empty, using fallback", { kpiName, rawOutput, parsed });
      return buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`);
    }

    const normalized = taskItems.slice(0, 6).map((task, index) => {
      try {
        return normalizeTaskItem(task ?? {}, index);
      } catch (taskError) {
        console.error("[generate-tasks] failed to normalize task item", { kpiName, index, task, taskError });
        return normalizeTaskItem({}, index);
      }
    });
    return normalized;
  } catch (error) {
    console.error("[generate-tasks] json parse failed, using fallback", { kpiName, error, rawOutput });
    return buildFallbackTasks(`${kpiName || FALLBACK_TASK_TITLE} の最初の一歩`);
  }
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as TaskRequest | null;
  const kgiId = typeof body?.kgiId === "string" ? body.kgiId.trim() : "";
  const kgiName = typeof body?.kgiName === "string" ? body.kgiName.trim() : "";
  const goalDescription = typeof body?.goalDescription === "string" ? body.goalDescription.trim() : "";
  const kpiId = typeof body?.kpiId === "string" ? body.kpiId.trim() : "";
  const phaseId = typeof body?.phaseId === "string" ? body.phaseId.trim() : "";
  const roadmapPhases = Array.isArray(body?.roadmapPhases) ? body.roadmapPhases : [];
  const targetPhase = body?.targetPhase && typeof body.targetPhase === "object" ? body.targetPhase : null;
  const allKpis = Array.isArray(body?.allKpis) ? body.allKpis : [];
  const targetKpi = body?.targetKpi && typeof body.targetKpi === "object" ? body.targetKpi : null;
  const existingTasksForTargetKpi = Array.isArray(body?.existingTasksForTargetKpi) ? body.existingTasksForTargetKpi : [];
  const targetDate = typeof body?.targetDate === "string" ? body.targetDate.trim() : "";
  const phaseDeadline = typeof body?.phaseDeadline === "string" ? body.phaseDeadline.trim() : "";
  const kpiName = typeof targetKpi?.name === "string" ? targetKpi.name.trim() : "";
  const recentReflections = normalizeRecentReflections(body?.recentReflections);
  const adaptationHints = buildAdaptationHints(recentReflections);
  const activeTaskCount = existingTasksForTargetKpi
    .filter((task) => {
      const status = typeof (task as any)?.status === "string" ? (task as any).status.trim().toLowerCase() : "";
      const isCompleted = Boolean((task as any)?.isCompleted);
      return !isCompleted && status === "active";
    })
    .length;

  if (!kgiName || !kpiName) {
    return NextResponse.json({
      error: "Invalid request body. Expected JSON with kgiName, goalDescription, roadmapPhases, targetPhase, allKpis, targetKpi."
    }, { status: 400 });
  }
  if (activeTaskCount >= 3) {
    return NextResponse.json({
      tasks: [],
      generationStoppedReason: "このKPIには進行中のタスクがすでに3件あります。まずは既存タスクを進めてください。"
    });
  }

  try {
    const promptText = buildTaskPrompt({
      kgiName,
      goalDescription,
      roadmapPhases,
      targetPhase,
      allKpis,
      targetKpi,
      existingTasksForTargetKpi,
      targetDate,
      phaseDeadline,
      adaptationHints,
    });
    console.log("[generate-tasks] request", {
      kgiId,
      kpiId,
      phaseId,
      kgiName,
      kpiName,
      allKpisCount: allKpis.length,
      existingTasksCount: existingTasksForTargetKpi.length,
      rawReflectionsCount: recentReflections.length,
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
            ...TASK_RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text().catch(() => "");
      const normalizedErrorText = errorText.trim();
      console.error("[generate-tasks] OpenAI API request failed", {
        kgiId,
        kpiId,
        phaseId,
        status: openAiResponse.status,
        statusText: openAiResponse.statusText,
        body: normalizedErrorText
      });
      console.log("[generate-tasks] response", { success: false, status: openAiResponse.status });
      return NextResponse.json({
        error: normalizedErrorText
          ? `OpenAI API request failed: ${normalizedErrorText}`
          : "OpenAI API request failed"
      }, { status: 502 });
    }

    const responseData = await openAiResponse.json();
    const outputText = extractOutputText(responseData);
    const structuredOutput = extractStructuredOutput(responseData);
    const tasks = safeParseTasks(structuredOutput ?? outputText, kpiName);
    const existingComparableTasks = existingTasksForTargetKpi.map((task, index) => toComparableTask(task, index));
    const deduplicatedTasks = filterDuplicateCandidates(tasks, existingComparableTasks);
    const { preferred, deferred } = filterRecentlyCompletedCategory(deduplicatedTasks, existingComparableTasks);
    const rankedPreferred = rankCandidatesByCategoryDiversity(preferred);
    const rankedDeferred = rankCandidatesByCategoryDiversity(deferred);
    const finalTasks = [...rankedPreferred, ...rankedDeferred.slice(0, rankedPreferred.length > 0 ? 1 : 0)].slice(0, 3);
    const generationStoppedReason = finalTasks.length === 0
      ? "今は新しい候補はありません。既存タスクを進めてください。"
      : "";

    console.log("[generate-tasks] response", {
      success: true,
      kgiId,
      kpiId,
      phaseId,
      taskCount: finalTasks.length,
      usedStructuredOutput: Boolean(structuredOutput),
      fallbackUsed: (!structuredOutput && !outputText) || tasks.some((task) => task.priority === 0)
    });
    return NextResponse.json({
      tasks: finalTasks,
      generationStoppedReason
    });
  } catch (error) {
    console.log("[generate-tasks] response", { success: false });
    console.error("[app/api/generate-tasks] Unexpected server error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
