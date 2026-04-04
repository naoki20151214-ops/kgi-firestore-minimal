import { collection, addDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const roughGoalInput = document.getElementById("roughGoalInput");
const roughDeadlineInput = document.getElementById("roughDeadlineInput");
const startDeepDiveButton = document.getElementById("startDeepDiveButton");

const questionSection = document.getElementById("questionSection");
const questionProgress = document.getElementById("questionProgress");
const questionText = document.getElementById("questionText");
const questionHelpText = document.getElementById("questionHelpText");
const questionAnswerInput = document.getElementById("questionAnswerInput");
const prevQuestionButton = document.getElementById("prevQuestionButton");
const nextQuestionButton = document.getElementById("nextQuestionButton");
const questionOptions = document.getElementById("questionOptions");
const otherAnswerField = document.getElementById("otherAnswerField");
const otherAnswerInput = document.getElementById("otherAnswerInput");

const proposalSection = document.getElementById("proposalSection");
const proposalList = document.getElementById("proposalList");
const understandingCheckSection = document.getElementById("understandingCheckSection");
const sourceDataApproveButton = document.getElementById("sourceDataApproveButton");
const sourceDataBackButton = document.getElementById("sourceDataBackButton");
const editSection = document.getElementById("editSection");
const nameInput = document.getElementById("kgiName");
const goalTextInput = document.getElementById("kgiGoalText");
const deadlineInput = document.getElementById("kgiDeadline");
const levelInput = document.getElementById("kgiLevel");
const saveButton = document.getElementById("saveButton");
const saveWithSpecificityButton = document.getElementById("saveWithSpecificityButton");
const editSpecificityButton = document.getElementById("editSpecificityButton");
const specificityWarningBox = document.getElementById("specificityWarningBox");
const specificityCandidateName = document.getElementById("specificityCandidateName");
const specificityCandidateGoal = document.getElementById("specificityCandidateGoal");
const specificityCandidateDeadline = document.getElementById("specificityCandidateDeadline");
const statusText = document.getElementById("statusText");
const errorRecoveryCard = document.getElementById("errorRecoveryCard");
const step1Label = document.getElementById("step1Label");
const step2Label = document.getElementById("step2Label");
const step3Label = document.getElementById("step3Label");
const step4Label = document.getElementById("step4Label");

const wizardState = {
  sessionId: null,
  step: 1,
  upperGoal: "",
  kgiDeadline: "",
  rawSuccessStateInput: "",
  ambiguityPoints: [],
  ambiguityPointsInitial: [],
  ambiguityPointsResolved: [],
  ambiguityPointsRemaining: [],
  followUpQuestions: [],
  followUpQuestionHistory: [],
  currentQuestionIndex: 0,
  followUpAnswers: {},
  followUpAnswerHistory: [],
  followUpStopReason: "",
  maxFollowUpQuestions: 4,
  clarifiedSuccessState: "",
  aiKgiSourceData: null,
  kgiStatement: "",
  kgiSuccessCriteria: [],
  nextKgiSuggestion: "",
  sourceDataConfirmed: false,
  sourceDataEdited: false,
  selectedDraft: null,
  genreClassification: null,
  genreKey: "other",
  currentKgiScope: "",
  requiredSlotsByGenre: [],
  filledSlots: [],
  missingRequiredSlots: [],
  minimumQuestionCountForGenre: 4,
  followUpCount: 0,
  sourceDataReady: false,
  gapAnalysis: null,
  kpiDrafts: [],
  interviewNotes: [],
  pendingAction: null,
  lastError: null,
  missingReasonLoopCounts: {},
  missingReasonLastIssue: "",
  missingReasonLastResolvedSlot: ""
};

const GENRE_KEYS = {
  media: "情報発信・メディア型",
  product: "商品販売型",
  service: "サービス受注型",
  investment: "投資・トレード型",
  selfImprovement: "自己改善型",
  other: "その他"
};

const REQUIRED_SLOTS_BY_GENRE = {
  media: ["concreteDeliverable", "productShape", "contentScope", "audienceSummary", "valuePromise", "publishDefinition", "minimumReleaseBundle", "hardRequirements", "excludedFromCurrentKgi"],
  product: ["concreteDeliverable", "productShape", "targetBuyer", "valuePromise", "salesMethod", "publishOrSalesDefinition", "minimumReleaseBundle", "hardRequirements", "excludedFromCurrentKgi"],
  service: ["serviceSummary", "targetClient", "valuePromise", "offerScope", "applicationDefinition", "minimumServiceLaunchLine", "hardRequirements", "excludedFromCurrentKgi"],
  investment: ["successDefinition", "measurementUnit", "targetMarket", "tradingStyleOrRuleBasis", "stabilityDefinition", "excludedFromCurrentKgi"],
  selfImprovement: ["successDefinition", "measurementUnit", "targetBehavior", "continuityDefinition", "minimumAchievementLine", "excludedFromCurrentKgi"],
  other: ["concreteDeliverable", "valuePromise", "hardRequirements", "excludedFromCurrentKgi"]
};

const MIN_QUESTION_COUNT_BY_GENRE = {
  media: 7,
  product: 6,
  service: 5,
  investment: 4,
  selfImprovement: 4,
  other: 4
};

const OPTIONAL_SLOTS_BY_GENRE = {
  media: ["idealReleaseBundle", "nextKgiSuggestion", "monetizationPreparation"],
  product: ["idealReleaseBundle", "nextKgiSuggestion", "monetizationPreparation"],
  service: ["idealReleaseBundle", "nextKgiSuggestion"],
  investment: ["nextKgiSuggestion"],
  selfImprovement: ["nextKgiSuggestion", "minimumAchievementLine"],
  other: ["nextKgiSuggestion"]
};

let db;

const FOLLOW_UP_LIBRARY = [
  {
    id: "service_type",
    ambiguityLabel: "副業/サービスの種類",
    text: "何の副業・何のサービスに最も近いですか？",
    options: [
      { id: "blog", label: "ブログ" },
      { id: "sns", label: "SNS発信" },
      { id: "youtube", label: "YouTube" },
      { id: "digital_product", label: "デジタル商品" },
      { id: "consulting", label: "相談/代行" },
      { id: "app_tool", label: "アプリ/ツール" },
      { id: "commerce", label: "物販" },
      { id: "investment", label: "FX/投資" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "domain",
    ambiguityLabel: "ジャンル",
    text: "どのジャンルに最も近いですか？",
    options: [
      { id: "ai", label: "AI" },
      { id: "side_business", label: "副業" },
      { id: "investment", label: "投資" },
      { id: "health", label: "健康" },
      { id: "career", label: "転職" },
      { id: "local", label: "地域情報" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "monetization_path",
    ambiguityLabel: "収益化手段",
    text: "収益は何で発生する想定ですか？",
    options: [
      { id: "affiliate", label: "アフィリエイト" },
      { id: "product_sale", label: "商品販売" },
      { id: "consulting", label: "相談/代行" },
      { id: "ads", label: "広告" },
      { id: "subscription", label: "課金" },
      { id: "undecided", label: "まだ未定" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "publish_level",
    trigger: ["公開", "サイト", "LP", "アプリ", "リリース"],
    ambiguityLabel: "公開の達成レベル",
    text: "「公開」とは、どの状態を達成したら成功ですか？",
    options: [
      { id: "private_url", label: "URLがあり自分だけ見られる状態" },
      { id: "public_url", label: "URLがあり第三者が見られる状態" },
      { id: "domain_public", label: "独自ドメインで第三者が見られる状態" },
      { id: "public_mobile", label: "一般公開され、スマホでも問題なく見られる状態" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "monetization_level",
    trigger: ["収益", "売上", "マネタイズ", "販売", "問い合わせ"],
    ambiguityLabel: "収益化の達成定義",
    text: "「収益化」とは、どの状態を達成したら成功ですか？",
    options: [
      { id: "route_ready", label: "収益導線が入っている状態" },
      { id: "first_click", label: "初回クリックが出た状態" },
      { id: "first_inquiry", label: "初回問い合わせが来た状態" },
      { id: "first_sale", label: "初回販売が出た状態" },
      { id: "monthly_target", label: "月売上目標を達成した状態" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "traffic_level",
    trigger: ["集客", "アクセス", "PV", "流入", "登録者"],
    ambiguityLabel: "集客の達成定義",
    text: "「集客できた」とは、どの状態を達成したら成功ですか？",
    options: [
      { id: "first_user", label: "SNSなどから最低1人来た状態" },
      { id: "daily_one", label: "1日に最低1人来る状態" },
      { id: "monthly_pv", label: "月間PVが一定数ある状態" },
      { id: "organic", label: "検索流入が確認できる状態" },
      { id: "lead", label: "見込み客や登録者が集まった状態" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "beginner_level",
    trigger: ["初心者", "わかりやす", "入門", "初学者"],
    ambiguityLabel: "対象読者レベル",
    text: "「初心者向け」とは、どの程度を想定しますか？",
    options: [
      { id: "no_terms", label: "専門用語なしで読める" },
      { id: "junior_high", label: "中学生でも大枠が分かる" },
      { id: "ai_newbie", label: "AIをほぼ知らない人でも読める" },
      { id: "busy_worker", label: "忙しい社会人がざっくり理解できる" },
      { id: "other", label: "その他" }
    ]
  }
];

const AMBIGUITY_CONFIG = [
  { id: "service_type", label: "副業/サービスの種類", priority: 1, keywords: ["ブログ", "SNS", "YouTube", "商品", "相談", "代行", "アプリ", "ツール", "物販", "投資"] },
  { id: "domain", label: "ジャンル", priority: 2, keywords: ["AI", "副業", "投資", "健康", "転職", "地域"] },
  { id: "monetization_path", label: "収益化手段", priority: 3, keywords: ["収益", "売上", "課金", "アフィリエイト", "広告", "販売"] },
  { id: "publish_level", label: "公開の達成レベル", priority: 4, keywords: ["公開", "サイト", "LP", "アプリ", "リリース"] },
  { id: "minimum_line", label: "最低公開ライン", priority: 5, keywords: ["最低", "必須", "公開ライン", "必要"] },
  { id: "must_vs_ideal", label: "理想条件と必須条件の区別", priority: 6, keywords: ["理想", "できれば", "っぽい", "みたい"] },
  { id: "success_metric", label: "成功定義", priority: 6, keywords: ["成功", "収支", "プラス", "勝ち", "月次"] },
  { id: "aggregation_unit", label: "集計単位", priority: 7, keywords: ["日次", "週次", "月次", "連続", "トレード"] },
  { id: "target_market", label: "対象市場・手法", priority: 8, keywords: ["FX", "株", "通貨", "市場", "先物"] },
  { id: "stability_definition", label: "安定の定義", priority: 9, keywords: ["安定", "継続", "ドローダウン", "損失"] },
  { id: "target_user", label: "誰向けか", priority: 7, keywords: ["向け", "対象", "ユーザー"] },
  { id: "traffic_level", label: "集客の達成定義", priority: 8, keywords: ["集客", "アクセス", "PV", "流入", "登録者"] },
  { id: "monetization_required", label: "収益導線が今回必須か", priority: 9, keywords: ["収益", "売上", "販売", "問い合わせ", "集客"] },
  { id: "beginner_level", label: "対象読者レベル", priority: 10, keywords: ["初心者", "わかりやす", "入門", "初学者"] },
  { id: "ui_completion", label: "UIの完成条件", priority: 10, keywords: ["UI", "デザイン", "見た目", "Yahoo"] }
];

const EXTRA_FOLLOW_UP_LIBRARY = [
  {
    id: "success_metric",
    ambiguityLabel: "成功定義",
    text: "今回の投資・トレードで「達成」と言える状態はどれに近いですか？",
    options: [
      { id: "net_profit_positive", label: "期間全体の収支がプラス" },
      { id: "consecutive_positive", label: "連続した集計期間でプラス" },
      { id: "max_drawdown_controlled", label: "損失上限を守りながらプラス" },
      { id: "rule_execution", label: "ルール逸脱なく運用できた" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "aggregation_unit",
    ambiguityLabel: "集計単位",
    text: "収支や達成判定は、どの単位で集計しますか？",
    options: [
      { id: "daily", label: "日次で集計する" },
      { id: "weekly", label: "週次で集計する" },
      { id: "monthly", label: "月次で集計する" },
      { id: "by_trade", label: "トレード単位で集計する" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "target_market",
    ambiguityLabel: "対象市場・手法",
    text: "今回の対象市場・手法はどれに近いですか？",
    options: [
      { id: "fx_major", label: "FX（主要通貨ペア中心）" },
      { id: "fx_cross", label: "FX（クロス通貨も含む）" },
      { id: "stock_index", label: "株価指数・先物" },
      { id: "spot_stock", label: "現物株" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "stability_definition",
    ambiguityLabel: "安定の定義",
    text: "「安定している」は、今回どの状態を指しますか？",
    options: [
      { id: "no_large_loss", label: "大きな損失を出さずに推移している" },
      { id: "max_drawdown_threshold", label: "最大ドローダウンが許容範囲内" },
      { id: "rule_consistency", label: "ルール逸脱がほぼない" },
      { id: "risk_return_balance", label: "リスクと利益のバランスが一定" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "target_user",
    ambiguityLabel: "誰向けか",
    text: "主な対象ユーザーはどれに最も近いですか？",
    options: [
      { id: "beginner_individual", label: "初心者の個人ユーザー" },
      { id: "experienced_individual", label: "経験者の個人ユーザー" },
      { id: "small_business", label: "小規模事業者" },
      { id: "own_use_first", label: "まず自分向け（後で拡張）" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "minimum_line",
    ambiguityLabel: "最低公開ライン",
    text: "最低公開ラインとして、どこまで満たせば「公開してよい」と判断しますか？",
    options: [
      { id: "minimum_one_flow", label: "主要導線が1本動き、最低限の説明コンテンツがある" },
      { id: "minimum_multi_content", label: "主要導線+複数コンテンツ（例: 3本以上）がある" },
      { id: "minimum_quality_check", label: "導線と中身に加え、簡易な品質確認まで完了している" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "must_vs_ideal",
    ambiguityLabel: "理想条件と必須条件の区別",
    text: "理想条件と必須条件の関係は、どれに近いですか？",
    options: [
      { id: "must_only", label: "必須条件を満たせば達成。理想条件は次のKGIで扱う" },
      { id: "must_plus_some_ideal", label: "必須条件+理想条件の一部が必要" },
      { id: "ideal_as_must", label: "理想条件も今回の必須条件として扱う" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "monetization_required",
    ambiguityLabel: "収益導線が今回必須か",
    text: "今回のKGIで、収益導線や売上はどこまで必須にしますか？",
    options: [
      { id: "not_required", label: "今回は必須にしない（公開と価値提供を優先）" },
      { id: "route_required", label: "収益導線の実装までは必須" },
      { id: "first_result_required", label: "初回の問い合わせ/販売など結果発生まで必須" },
      { id: "other", label: "その他" }
    ]
  },
  {
    id: "ui_completion",
    ambiguityLabel: "UIの完成条件",
    text: "UI・見た目の完成条件は、今回どこまでを必須にしますか？",
    options: [
      { id: "readable_only", label: "情報が読みやすく使える最低限でよい" },
      { id: "brand_consistent", label: "最低限+統一感のある見た目が必要" },
      { id: "high_fidelity", label: "デザイン品質まで高水準で整える必要がある" },
      { id: "other", label: "その他" }
    ]
  }
];

const ALL_FOLLOW_UP_LIBRARY = [...FOLLOW_UP_LIBRARY, ...EXTRA_FOLLOW_UP_LIBRARY];
const REQUIRED_SLOT_QUESTION_LIBRARY = [
  { id: "concreteDeliverable", ambiguityLabel: "今回作る具体成果物", text: "今回の期限までに何を完成させますか？", options: [{ id: "site", label: "公開可能なサイト/メディア" }, { id: "product", label: "販売可能な商品ページ+商品本体" }, { id: "service", label: "受注可能なサービス提供ページ" }, { id: "other", label: "その他" }] },
  { id: "productShape", ambiguityLabel: "成果物の形", text: "成果物の形はどれに近いですか？", options: [{ id: "news", label: "ニュース一覧/メディア型" }, { id: "catalog", label: "商品紹介・販売型" }, { id: "application", label: "申込み導線型" }, { id: "other", label: "その他" }] },
  { id: "contentScope", ambiguityLabel: "内容範囲", text: "今回含める内容範囲はどれですか？", options: [{ id: "base", label: "基本カテゴリのみ" }, { id: "base_plus_examples", label: "基本カテゴリ+事例" }, { id: "full", label: "体系立てた学習/比較導線まで" }, { id: "other", label: "その他" }] },
  { id: "audienceSummary", ambiguityLabel: "想定対象", text: "今回の主な対象はどの人ですか？", options: [{ id: "ai_beginner", label: "AI初心者で情報整理に困っている人" }, { id: "buyer", label: "購入検討中の見込み顧客" }, { id: "client", label: "依頼を検討する法人/個人" }, { id: "other", label: "その他" }] },
  { id: "valuePromise", ambiguityLabel: "届ける価値", text: "今回の成果物で、対象にどんな価値を届けますか？", options: [{ id: "learn", label: "迷わず理解し次の行動を選べる" }, { id: "buy", label: "比較して購入判断できる" }, { id: "request", label: "安心して依頼判断できる" }, { id: "other", label: "その他" }] },
  { id: "publishDefinition", ambiguityLabel: "公開定義", text: "「公開できた」はどの状態ですか？", options: [{ id: "public_url", label: "第三者が閲覧できるURL公開" }, { id: "domain", label: "独自ドメインで公開" }, { id: "mobile", label: "独自ドメイン+スマホ対応で公開" }, { id: "other", label: "その他" }] },
  { id: "minimumReleaseBundle", ambiguityLabel: "最低公開ライン", text: "最低ラインとして必須にする束はどれですか？", options: [{ id: "minimum_basic", label: "トップ+主要導線+最低コンテンツ" }, { id: "minimum_quant", label: "カテゴリ数/記事数など数量条件込み" }, { id: "minimum_plus_monetize", label: "公開条件+収益/申込導線設置" }, { id: "other", label: "その他" }] },
  { id: "hardRequirements", ambiguityLabel: "必須条件", text: "今回のKGIで絶対に外せない必須条件は？", options: [{ id: "must_only", label: "期限内に公開・利用可能であること" }, { id: "must_quality", label: "公開に加えて品質条件を満たすこと" }, { id: "must_with_line", label: "最低ラインの全項目を満たすこと" }, { id: "other", label: "その他" }] },
  { id: "excludedFromCurrentKgi", ambiguityLabel: "今回除外", text: "今回のKGIから外して次に回すものは？", options: [{ id: "exclude_growth", label: "公開後の流入/反応確認" }, { id: "exclude_revenue", label: "公開後の売上/収益結果" }, { id: "exclude_scale", label: "拡張機能・大規模運用" }, { id: "other", label: "その他" }] },
  { id: "targetBuyer", ambiguityLabel: "購入者像", text: "商品を買う想定の相手は？", options: [{ id: "individual_beginner", label: "個人の初心者層" }, { id: "individual_middle", label: "経験のある個人層" }, { id: "business", label: "事業者/法人" }, { id: "other", label: "その他" }] },
  { id: "salesMethod", ambiguityLabel: "販売方法", text: "販売方法はどれに近いですか？", options: [{ id: "lp", label: "LP+決済導線" }, { id: "ec", label: "ECカート経由" }, { id: "dm", label: "DM/問い合わせ経由" }, { id: "other", label: "その他" }] },
  { id: "publishOrSalesDefinition", ambiguityLabel: "販売開始定義", text: "販売開始できたと判断する条件は？", options: [{ id: "checkout", label: "購入操作が完了できる" }, { id: "order_form", label: "申込フォーム送信が動作" }, { id: "first_order_excluded", label: "導線動作確認まで（初回売上は次KGI）" }, { id: "other", label: "その他" }] },
  { id: "serviceSummary", ambiguityLabel: "サービス概要", text: "今回受注可能にするサービス内容は？", options: [{ id: "consult", label: "相談/コンサル提供" }, { id: "production", label: "制作/実装代行" }, { id: "operation", label: "運用支援" }, { id: "other", label: "その他" }] },
  { id: "targetClient", ambiguityLabel: "対象顧客", text: "主な依頼対象はどれですか？", options: [{ id: "small_business", label: "小規模事業者" }, { id: "individual", label: "個人事業主" }, { id: "team", label: "企業の担当チーム" }, { id: "other", label: "その他" }] },
  { id: "offerScope", ambiguityLabel: "提供範囲", text: "今回の提供範囲はどこまで？", options: [{ id: "single_menu", label: "単一メニューのみ" }, { id: "menu_plus_option", label: "主サービス+オプション" }, { id: "full_package", label: "申込から納品まで一式" }, { id: "other", label: "その他" }] },
  { id: "applicationDefinition", ambiguityLabel: "申込定義", text: "申込み可能の定義はどれですか？", options: [{ id: "form_ready", label: "申込フォームが機能する" }, { id: "flow_ready", label: "申込〜返信フローが機能する" }, { id: "contract_ready", label: "申込後の契約導線まで整備" }, { id: "other", label: "その他" }] },
  { id: "minimumServiceLaunchLine", ambiguityLabel: "最低受注開始ライン", text: "受注開始の最低ラインは？", options: [{ id: "offer_page", label: "サービスページ+申込フォーム" }, { id: "offer_with_case", label: "ページ+実績例+申込導線" }, { id: "offer_with_process", label: "ページ+価格+進行フロー明示" }, { id: "other", label: "その他" }] },
  { id: "successDefinition", ambiguityLabel: "成功定義", text: "今回の成功定義はどれに近いですか？", options: [{ id: "profit_positive", label: "期間収支がプラス" }, { id: "consecutive_positive", label: "連続期間でプラス" }, { id: "rule_compliance", label: "ルール順守で目標達成" }, { id: "other", label: "その他" }] },
  { id: "measurementUnit", ambiguityLabel: "測定単位", text: "判定の測定単位は？", options: [{ id: "daily", label: "日次" }, { id: "weekly", label: "週次" }, { id: "monthly", label: "月次" }, { id: "other", label: "その他" }] },
  { id: "targetMarket", ambiguityLabel: "対象市場", text: "対象市場はどれですか？", options: [{ id: "fx_major", label: "FX主要通貨ペア" }, { id: "fx_multi", label: "FX複数通貨ペア" }, { id: "stock", label: "株式/指数" }, { id: "other", label: "その他" }] },
  { id: "tradingStyleOrRuleBasis", ambiguityLabel: "手法・ルール基準", text: "運用スタイル/ルール基準は？", options: [{ id: "rule_fixed", label: "固定ルールで運用" }, { id: "rule_with_filter", label: "固定ルール+相場フィルタ" }, { id: "discretion_limited", label: "裁量ありだが制約付き" }, { id: "other", label: "その他" }] },
  { id: "stabilityDefinition", ambiguityLabel: "安定定義", text: "「安定」の定義はどれですか？", options: [{ id: "drawdown", label: "ドローダウン上限内で推移" }, { id: "loss_limit", label: "損失上限ルールを逸脱しない" }, { id: "profit_consistent", label: "一定期間プラスを維持" }, { id: "other", label: "その他" }] },
  { id: "targetBehavior", ambiguityLabel: "対象行動", text: "改善対象の行動は？", options: [{ id: "study", label: "学習習慣" }, { id: "exercise", label: "運動習慣" }, { id: "work_output", label: "業務アウトプット習慣" }, { id: "other", label: "その他" }] },
  { id: "continuityDefinition", ambiguityLabel: "継続定義", text: "継続できた状態の定義は？", options: [{ id: "days", label: "日数連続で実行" }, { id: "weeks", label: "週単位で継続達成" }, { id: "rate", label: "実行率で判定" }, { id: "other", label: "その他" }] },
  { id: "minimumAchievementLine", ambiguityLabel: "最低達成ライン", text: "最低達成ラインはどれですか？", options: [{ id: "minimum_count", label: "最低実行回数を満たす" }, { id: "minimum_rate", label: "最低実行率を満たす" }, { id: "minimum_quality", label: "回数+質の条件を満たす" }, { id: "other", label: "その他" }] }
];
const ENHANCED_FOLLOW_UP_LIBRARY = [...ALL_FOLLOW_UP_LIBRARY, ...REQUIRED_SLOT_QUESTION_LIBRARY];
const FOLLOW_UP_BY_ID = new Map(ENHANCED_FOLLOW_UP_LIBRARY.map((question) => [question.id, question]));
const FOLLOW_UP_SLOT_DEFINITIONS = Array.from(FOLLOW_UP_BY_ID.keys());
const SLOT_LABELS = {
  concreteDeliverable: "今回作るもの",
  productShape: "作るものの形",
  contentScope: "含める内容",
  audienceSummary: "想定する読者",
  valuePromise: "届ける価値",
  publishDefinition: "公開の定義",
  minimumReleaseBundle: "公開の最低ライン",
  hardRequirements: "今回必須の条件",
  excludedFromCurrentKgi: "今回は入れないもの",
  targetBuyer: "想定購入者",
  salesMethod: "販売方法",
  publishOrSalesDefinition: "販売開始の定義",
  serviceSummary: "今回のサービス概要",
  targetClient: "対象クライアント",
  offerScope: "提供範囲",
  applicationDefinition: "申込可能の定義",
  minimumServiceLaunchLine: "受注開始の最低ライン",
  successDefinition: "成功の定義",
  measurementUnit: "判定の単位",
  targetMarket: "対象市場",
  tradingStyleOrRuleBasis: "取引スタイル/ルール基準",
  stabilityDefinition: "安定の定義",
  targetBehavior: "対象行動",
  continuityDefinition: "継続の定義",
  minimumAchievementLine: "最低達成ライン"
};
const SLOT_ID_BY_LABEL = Object.fromEntries(Object.entries(SLOT_LABELS).map(([slot, label]) => [label, slot]));
const MISSING_REASON_TO_SLOT_HINTS = [
  { matcher: /判定条件が具体的でない/, slotsByGenre: { media: ["publishDefinition", "minimumReleaseBundle", "hardRequirements"], product: ["publishOrSalesDefinition", "minimumReleaseBundle", "hardRequirements"], service: ["applicationDefinition", "minimumServiceLaunchLine", "hardRequirements"], investment: ["successDefinition", "measurementUnit", "stabilityDefinition"], selfImprovement: ["successDefinition", "measurementUnit", "minimumAchievementLine"], other: ["hardRequirements", "concreteDeliverable"] } },
  { matcher: /最低ラインが曖昧/, slotsByGenre: { media: ["minimumReleaseBundle"], product: ["minimumReleaseBundle"], service: ["minimumServiceLaunchLine"], selfImprovement: ["minimumAchievementLine"], other: ["minimumReleaseBundle", "minimumServiceLaunchLine", "minimumAchievementLine"] } },
  { matcher: /公開条件が曖昧/, slotsByGenre: { media: ["publishDefinition"], product: ["publishOrSalesDefinition"], service: ["applicationDefinition"], other: ["publishDefinition", "publishOrSalesDefinition", "applicationDefinition"] } },
  { matcher: /想定読者が曖昧/, slotsByGenre: { media: ["audienceSummary"], product: ["targetBuyer"], service: ["targetClient"], selfImprovement: ["targetBehavior"], other: ["audienceSummary", "targetClient"] } },
  { matcher: /成功定義が曖昧/, slotsByGenre: { investment: ["successDefinition"], selfImprovement: ["successDefinition"], other: ["successDefinition"] } },
  { matcher: /利益の測定単位が曖昧/, slotsByGenre: { investment: ["measurementUnit"], selfImprovement: ["measurementUnit"], other: ["measurementUnit"] } },
  { matcher: /安定の定義が曖昧/, slotsByGenre: { investment: ["stabilityDefinition"], other: ["stabilityDefinition"] } }
];
const CRITERIA_REASON_PATTERN = /判定条件が具体的でない|最低ラインが曖昧/;
const CRITERIA_SLOT_FAMILY_BY_GENRE = {
  media: ["minimumReleaseBundle", "hardRequirements", "publishDefinition"],
  product: ["minimumReleaseBundle", "hardRequirements", "publishOrSalesDefinition"],
  service: ["minimumServiceLaunchLine", "hardRequirements", "applicationDefinition"],
  investment: ["successDefinition", "measurementUnit", "stabilityDefinition"],
  selfImprovement: ["minimumAchievementLine", "successDefinition", "measurementUnit"],
  other: ["minimumReleaseBundle", "minimumServiceLaunchLine", "minimumAchievementLine", "hardRequirements"]
};
const QUESTION_RULES = {
  service_type: { requiredContext: [], specificityLevel: "specific", priority: 1 },
  domain: { requiredContext: ["service_type"], specificityLevel: "specific", priority: 2 },
  monetization_path: { requiredContext: ["service_type"], specificityLevel: "specific", priority: 3 },
  publish_level: { requiredContext: [], specificityLevel: "specific", priority: 4 },
  minimum_line: { requiredContext: ["service_type"], specificityLevel: "specific", priority: 5 },
  must_vs_ideal: { requiredContext: [], specificityLevel: "specific", priority: 6 },
  success_metric: { requiredContext: ["service_type"], specificityLevel: "specific", priority: 6 },
  aggregation_unit: { requiredContext: ["success_metric"], specificityLevel: "specific", priority: 7 },
  target_market: { requiredContext: ["service_type"], specificityLevel: "specific", priority: 8 },
  stability_definition: { requiredContext: ["success_metric"], specificityLevel: "specific", priority: 9 },
  target_user: { requiredContext: ["service_type", "domain", "monetization_path"], specificityLevel: "specific", priority: 7 },
  traffic_level: { requiredContext: [], specificityLevel: "specific", priority: 8 },
  monetization_required: { requiredContext: ["monetization_path"], specificityLevel: "specific", priority: 9 },
  beginner_level: { requiredContext: ["target_user"], specificityLevel: "specific", priority: 10 },
  ui_completion: { requiredContext: [], specificityLevel: "specific", priority: 10 }
};
const CONTEXT_BY_QUESTION_ID = {
  service_type: "service_type",
  domain: "domain",
  monetization_path: "monetization_path",
  success_metric: "success_metric",
  aggregation_unit: "aggregation_unit",
  target_market: "target_market",
  stability_definition: "stability_definition",
  target_user: "target_user",
  publish_level: "publish_level",
  minimum_line: "minimum_line",
  must_vs_ideal: "must_vs_ideal"
};
const ABSTRACT_TERMS = ["状態", "価値", "達成", "意味", "誰に何を"];
const FOLLOW_UP_DEBUG_PREFIX = "[KGI_FOLLOWUP_DEBUG]";
let isAdvancingQuestion = false;
const SESSION_LOG_PREFIX = "[KGI_SESSION]";
const LOCAL_DRAFT_PREFIX = "kgi_wizard_draft_v2:";
const LOCAL_DRAFT_LATEST_KEY = "kgi_wizard_draft_latest_v2";
const DRAFT_RESTORE_TTL_MS = 1000 * 60 * 60 * 24;
const BLOCKED_PHRASES = ["未確定", "追加確認中", "公開状態", "主要導線が1本動く", "利用可能な成果物"];
const INITIAL_WIZARD_STATE = structuredClone(wizardState);

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const logSessionInfo = (message, detail = {}) => {
  console.info(`${SESSION_LOG_PREFIX} ${message}`, detail);
};

const getSessionFingerprint = (deadline = wizardState.kgiDeadline, rawInput = wizardState.rawSuccessStateInput) => {
  const normalizedDeadline = String(deadline || "").trim();
  const normalizedRawInput = String(rawInput || "").trim().replace(/\s+/g, " ");
  return `${normalizedDeadline}::${normalizedRawInput}`;
};

const getDraftStorageKey = () => `${LOCAL_DRAFT_PREFIX}${wizardState.sessionId || getSessionFingerprint() || "anonymous"}`;

const resetWizardSessionState = () => {
  const preservedStatus = statusText?.textContent || "";
  Object.assign(wizardState, structuredClone(INITIAL_WIZARD_STATE));
  questionSection?.classList.add("hidden");
  proposalSection?.classList.add("hidden");
  understandingCheckSection?.classList.add("hidden");
  proposalList?.classList.add("hidden");
  editSection?.classList.add("hidden");
  if (statusText) setStatus(preservedStatus || "入力待ちです。", false);
  logSessionInfo("session reset complete");
};

const normalizeOptionLabel = (label = "") => String(label || "")
  .replace(/納品物|成果物/g, "作るもの")
  .replace(/具体的成果/g, "変化")
  .replace(/利用可能な状態/g, "使える状態")
  .replace(/判定可能にする/g, "達成と言える状態にする")
  .trim();

const normalizeQuestionCopy = (rawText = "") => {
  const text = String(rawText || "").trim();
  if (!text) return "";
  return text
    .replace("最終的にどの形の具体的な納品物（成果物）を求めますか？", "今回、最終的に何を完成させたいですか？")
    .replace("この20本の記事群で読者にどんな具体的成果を約束しますか？", "このサイトを読んだ人に、どんな状態になってほしいですか？")
    .replace(/納品物|成果物/g, "作るもの")
    .replace(/約束しますか/g, "目指しますか")
    .replace(/具体的成果/g, "変化")
    .replace(/利用可能な状態/g, "使える状態")
    .replace(/判定可能にする/g, "達成と言える状態にする")
    .replace(/最終的にどの形の具体的な/g, "最終的にどんな")
    .replace(/\s+/g, " ")
    .trim();
};

const getPersistableWizardSnapshot = () => ({
  sessionId: wizardState.sessionId,
  step: wizardState.step,
  upperGoal: wizardState.upperGoal,
  kgiDeadline: wizardState.kgiDeadline,
  rawSuccessStateInput: wizardState.rawSuccessStateInput,
  followUpQuestionHistory: wizardState.followUpQuestionHistory,
  currentQuestionIndex: wizardState.currentQuestionIndex,
  followUpAnswers: wizardState.followUpAnswers,
  followUpAnswerHistory: wizardState.followUpAnswerHistory,
  followUpStopReason: wizardState.followUpStopReason,
  aiKgiSourceData: wizardState.aiKgiSourceData,
  sourceDataConfirmed: wizardState.sourceDataConfirmed,
  sourceDataEdited: wizardState.sourceDataEdited,
  genreClassification: wizardState.genreClassification,
  genreKey: wizardState.genreKey,
  currentKgiScope: wizardState.currentKgiScope,
  requiredSlotsByGenre: wizardState.requiredSlotsByGenre,
  filledSlots: wizardState.filledSlots,
  missingRequiredSlots: wizardState.missingRequiredSlots,
  minimumQuestionCountForGenre: wizardState.minimumQuestionCountForGenre,
  followUpCount: wizardState.followUpCount,
  sourceDataReady: wizardState.sourceDataReady,
  kgiStatement: wizardState.kgiStatement,
  kgiSuccessCriteria: wizardState.kgiSuccessCriteria,
  clarifiedSuccessState: wizardState.clarifiedSuccessState,
  nextKgiSuggestion: wizardState.nextKgiSuggestion,
  gapAnalysis: wizardState.gapAnalysis,
  kpiDrafts: wizardState.kpiDrafts,
  interviewNotes: wizardState.interviewNotes,
  missingReasonLoopCounts: wizardState.missingReasonLoopCounts,
  missingReasonLastIssue: wizardState.missingReasonLastIssue,
  missingReasonLastResolvedSlot: wizardState.missingReasonLastResolvedSlot
});

const persistDraftToLocal = () => {
  try {
    const key = getDraftStorageKey();
    localStorage.setItem(key, JSON.stringify({
      updatedAt: new Date().toISOString(),
      draftKey: key,
      sessionFingerprint: getSessionFingerprint(),
      kgiDeadline: wizardState.kgiDeadline,
      rawSuccessStateInput: wizardState.rawSuccessStateInput,
      payload: getPersistableWizardSnapshot()
    }));
    localStorage.setItem(LOCAL_DRAFT_LATEST_KEY, key);
  } catch (error) {
    console.warn("localStorage保存に失敗", error);
  }
};

const clearLocalDraft = () => {
  try {
    const key = localStorage.getItem(LOCAL_DRAFT_LATEST_KEY);
    if (key) localStorage.removeItem(key);
    localStorage.removeItem(LOCAL_DRAFT_LATEST_KEY);
  } catch (_) {}
};

const syncPersistence = async () => {
  persistDraftToLocal();
  try {
    await updateCreationSession();
  } catch (error) {
    console.warn("セッション更新に失敗。ローカル下書きは保持", error);
  }
};

const renderRecoveryCard = () => {
  if (!errorRecoveryCard) return;
  const shouldShow = Boolean(wizardState.lastError);
  errorRecoveryCard.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) {
    errorRecoveryCard.innerHTML = "";
    return;
  }
  errorRecoveryCard.innerHTML = `
    <p>${wizardState.lastError}</p>
    <div class="error-recovery-actions">
      <button id="retryActionButton" type="button">もう一度生成する</button>
      <button id="switchFallbackButton" class="secondary" type="button">通常生成に切り替える</button>
      <button id="saveDraftButton" class="secondary" type="button">下書きを保存して後で再開する</button>
    </div>
  `;
  document.getElementById("retryActionButton")?.addEventListener("click", async () => {
    const action = wizardState.pendingAction;
    if (typeof action === "function") await action();
  });
  document.getElementById("switchFallbackButton")?.addEventListener("click", async () => {
    wizardState.lastError = "通常生成に切り替えました。回答内容は保持されています。";
    renderRecoveryCard();
    setStatus("通常生成モードで続行します。", false);
    if (!wizardState.aiKgiSourceData && wizardState.followUpAnswerHistory.length > 0) {
      buildKgiSourceData();
      wizardState.sourceDataReady = true;
      await syncPersistence();
      renderProposal();
    }
  });
  document.getElementById("saveDraftButton")?.addEventListener("click", () => {
    persistDraftToLocal();
    setStatus("下書きを保存しました。後でこの端末から再開できます。", false);
  });
};

const logFollowUpInfo = (stage, detail = {}) => {
  console.log(`${FOLLOW_UP_DEBUG_PREFIX} ${stage}`, detail);
};

const logFollowUpError = (stage, detail = {}) => {
  console.error(`${FOLLOW_UP_DEBUG_PREFIX} ${stage}`, detail);
};
const logMissingFlowInfo = (stage, detail = {}) => {
  console.log(`[KGI_MISSING_FLOW] ${stage}`, detail);
};
const logMissingFlowError = (stage, detail = {}) => {
  console.error(`[KGI_MISSING_FLOW] ${stage}`, detail);
};

const setStep = (step) => {
  if (step >= 3 && !wizardState.sourceDataReady) step = 2;
  wizardState.step = step;
  [step1Label, step2Label, step3Label, step4Label].forEach((node, index) => {
    const n = index + 1;
    node.classList.toggle("active", n === step);
    node.classList.toggle("completed", n < step);
  });
  persistDraftToLocal();
};

const hasRenderableSourceData = () => Boolean(wizardState.sourceDataReady && wizardState.aiKgiSourceData);

roughDeadlineInput?.addEventListener("input", () => {
  wizardState.kgiDeadline = (roughDeadlineInput.value || "").trim();
  persistDraftToLocal();
});
roughGoalInput?.addEventListener("input", () => {
  wizardState.rawSuccessStateInput = (roughGoalInput.value || "").trim();
  persistDraftToLocal();
});

const pickUpperGoal = (rawText) => {
  const first = (rawText || "").split(/[。\n]/).map((v) => v.trim()).find(Boolean) || "叶えたい未来を言語化中";
  return first;
};

const shouldAsk = (keywords, rawText) => keywords.some((keyword) => rawText.includes(keyword));

const isAudienceClearlyDefined = (text) => /(向け|対象|ペルソナ|初心者|中級者|法人|個人)/.test(text);
const isMinimumLineDefined = (text) => /(最低|少なくとも|必須|本以上|件以上|導線|ページ)/.test(text);
const hasConcreteMetric = (text) => /(\d+|PV|率|売上|件|人|公開|ドメイン)/.test(text);

const normalizeGenreKey = (genreLabel = "") => {
  if (genreLabel.includes("情報発信") || genreLabel.includes("メディア")) return "media";
  if (genreLabel.includes("商品販売")) return "product";
  if (genreLabel.includes("サービス受注")) return "service";
  if (genreLabel.includes("投資") || genreLabel.includes("トレード")) return "investment";
  if (genreLabel.includes("自己改善")) return "selfImprovement";
  return "other";
};

const isInvestmentGenreKey = (genreKey = wizardState.genreKey) => genreKey === "investment";

const getSourceDataSections = (sourceData, genreKey = wizardState.genreKey) => {
  const base = [
    { label: "あなたが本当に叶えたい未来", value: sourceData.upperGoal },
    { label: "今回の期限で狙う範囲", value: sourceData.currentKgiScope }
  ];
  if (isInvestmentGenreKey(genreKey)) {
    return [
      ...base,
      { label: "成功の定義", value: sourceData.successDefinition },
      { label: "利益の測り方", value: sourceData.measurementUnit },
      { label: "対象市場", value: sourceData.targetMarket },
      { label: "取引スタイル / 裁量かルールベースか", value: sourceData.tradingStyleOrRuleBasis },
      { label: "安定の定義", value: sourceData.stabilityDefinition },
      { label: "除外条件", value: (sourceData.excludedFromCurrentKgi || []).join("、") || "特になし" },
      { label: "次のKGI候補", value: sourceData.nextKgiSuggestion || "特になし" }
    ];
  }
  return [
    ...base,
    { label: "今回作るもの", value: sourceData.concreteDeliverable },
    { label: "想定する読者", value: sourceData.audienceSummary },
    { label: "どんな価値を届けるか", value: sourceData.valuePromise },
    { label: "公開してよい最低ライン", value: (sourceData.minimumReleaseBundle || []).join("、") || sourceData.minimumSuccessLine },
    { label: "理想ライン", value: (sourceData.idealReleaseBundle || []).join("、") || sourceData.idealSuccessLine },
    { label: "今回は入れないもの", value: (sourceData.excludedFromCurrentKgi || []).join("、") || "特になし" },
    { label: "次のKGI候補", value: sourceData.nextKgiSuggestion || "特になし" }
  ];
};

const getSlotValue = (slot) => {
  const answer = wizardState.followUpAnswers[slot];
  if (!answer?.selectedOptionId) return "";
  if (answer.selectedOptionId === "other") return (answer.otherText || "").trim();
  return (answer.selectedOptionLabel || "").trim();
};

const isSlotFilled = (slot) => {
  const v = getSlotValue(slot);
  if (!v) return false;
  return !BLOCKED_PHRASES.some((phrase) => String(v).includes(phrase));
};

const recomputeRequiredSlotState = () => {
  const required = wizardState.requiredSlotsByGenre || [];
  const filled = required.filter((slot) => isSlotFilled(slot));
  wizardState.filledSlots = filled;
  wizardState.missingRequiredSlots = required.filter((slot) => !filled.includes(slot));
  wizardState.followUpCount = wizardState.followUpAnswerHistory.length;
};

const classifyKgiGenre = async () => {
  try {
    const response = await fetch("/api/classify-kgi-genre", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kgiDeadline: wizardState.kgiDeadline,
        rawSuccessStateInput: wizardState.rawSuccessStateInput,
        upperGoal: wizardState.upperGoal
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.primaryGenre) throw new Error("genre_api_error");
    wizardState.genreClassification = data;
    wizardState.genreKey = normalizeGenreKey(data.primaryGenre || "");
    return data;
  } catch (error) {
    const raw = wizardState.rawSuccessStateInput || "";
    const fallbackGenre = /(FX|投資|トレード|株|為替)/i.test(raw) ? "投資・トレード型" : "その他";
    const fallback = {
      primaryGenre: fallbackGenre,
      confidence: "low",
      reason: "AI判定に失敗したため、入力テキストからの簡易推定を使用しました。",
      multipleKgiDetected: false,
      splitSuggestion: "",
      suggestedSlots: []
    };
    wizardState.genreClassification = fallback;
    wizardState.genreKey = normalizeGenreKey(fallback.primaryGenre || "");
    return fallback;
  }
};

const deriveAmbiguityPoints = (rawText, genre = "") => {
  const isInvestmentGenre = genre.includes("投資") || genre.includes("トレード");
  if (isInvestmentGenre) {
    const investmentIds = ["service_type", "success_metric", "aggregation_unit", "target_market", "stability_definition", "must_vs_ideal"];
    return investmentIds
      .map((id) => AMBIGUITY_CONFIG.find((config) => config.id === id))
      .filter(Boolean);
  }
  const points = [];
  const contextMissingDefaults = ["service_type", "domain", "monetization_path"];
  AMBIGUITY_CONFIG.forEach((config) => {
    if (contextMissingDefaults.includes(config.id)) {
      points.push(config);
      return;
    }
    const keywordMatched = shouldAsk(config.keywords, rawText);
    if (keywordMatched) {
      points.push(config);
      return;
    }
    if (config.id === "target_user" && !isAudienceClearlyDefined(rawText)) points.push(config);
    if (config.id === "minimum_line" && !isMinimumLineDefined(rawText)) points.push(config);
    if (config.id === "must_vs_ideal" && /(理想|できれば|っぽい|みたい)/.test(rawText)) points.push(config);
    if (config.id === "traffic_level" && !hasConcreteMetric(rawText) && /(集客|アクセス|流入)/.test(rawText)) points.push(config);
  });

  const unique = [];
  const seen = new Set();
  points
    .sort((a, b) => a.priority - b.priority)
    .forEach((point) => {
      if (seen.has(point.id)) return;
      seen.add(point.id);
      unique.push(point);
    });
  return unique;
};

const getResolvedAmbiguityIds = () => {
  const ids = [];
  wizardState.followUpQuestionHistory.forEach((historyItem) => {
    const answer = wizardState.followUpAnswers[historyItem.id];
    if (answer?.selectedOptionId) ids.push(historyItem.id);
  });
  return Array.from(new Set(ids));
};

const getResolvedContext = () => {
  const context = new Set();
  wizardState.followUpQuestionHistory.forEach((historyItem) => {
    const answer = wizardState.followUpAnswers[historyItem.id];
    if (!answer?.selectedOptionId) return;
    const key = CONTEXT_BY_QUESTION_ID[historyItem.id];
    if (key) context.add(key);
  });
  return context;
};

const isAbstractQuestion = (question) => {
  if (!question) return true;
  const questionRule = QUESTION_RULES[question.id];
  if (questionRule?.specificityLevel === "abstract") return true;
  const text = question.text || "";
  return ABSTRACT_TERMS.some((term) => text.includes(term) && !text.includes("どの状態"));
};

const hasRequiredContext = (questionId) => {
  const required = QUESTION_RULES[questionId]?.requiredContext || [];
  const resolvedContext = getResolvedContext();
  return required.every((key) => resolvedContext.has(key));
};

const recomputeAmbiguityState = () => {
  const resolvedIds = getResolvedAmbiguityIds();
  wizardState.ambiguityPointsResolved = wizardState.ambiguityPointsInitial.filter((point) => resolvedIds.includes(point.id));
  wizardState.ambiguityPointsRemaining = wizardState.ambiguityPointsInitial.filter((point) => !resolvedIds.includes(point.id));
  wizardState.ambiguityPoints = wizardState.ambiguityPointsRemaining.map((point) => point.label);
};

const chooseNextQuestion = () => {
  recomputeRequiredSlotState();
  const asked = new Set(wizardState.followUpQuestionHistory.map((item) => item.id));
  const nextRequired = wizardState.missingRequiredSlots.find((slot) => !asked.has(slot) && FOLLOW_UP_BY_ID.has(slot));
  if (nextRequired) return { id: nextRequired, label: nextRequired, priority: 1 };
  if (wizardState.followUpCount < wizardState.minimumQuestionCountForGenre) {
    const optionalSlots = OPTIONAL_SLOTS_BY_GENRE[wizardState.genreKey] || [];
    const nextOptional = optionalSlots.find((slot) => !asked.has(slot) && FOLLOW_UP_BY_ID.has(slot));
    if (nextOptional) return { id: nextOptional, label: nextOptional, priority: 2 };
  }
  return null;
};

const getQuestionRecord = (questionId) => {
  const historyItem = wizardState.followUpQuestionHistory.find((item) => item.id === questionId);
  if (historyItem?.followUpQuestionText && Array.isArray(historyItem.followUpOptionsSnapshot)) {
    return {
      id: historyItem.id,
      text: normalizeQuestionCopy(historyItem.followUpQuestionText),
      helpText: historyItem.followUpHelpText || "",
      options: historyItem.followUpOptionsSnapshot.map((option) => ({ ...option, label: normalizeOptionLabel(option.label) })),
      allowOtherText: historyItem.allowOtherText !== false
    };
  }
  const fallback = FOLLOW_UP_BY_ID.get(questionId);
  if (!fallback) return null;
  return {
    id: fallback.id,
    text: normalizeQuestionCopy(fallback.text),
    helpText: "",
    options: fallback.options.map((option) => ({ ...option, label: normalizeOptionLabel(option.label) })),
    allowOtherText: true
  };
};

const buildFollowUpQuestionPayload = (nextSlot) => ({
  slot: nextSlot,
  availableSlots: FOLLOW_UP_SLOT_DEFINITIONS,
  upperGoal: wizardState.upperGoal,
  kgiDeadline: wizardState.kgiDeadline,
  rawSuccessStateInput: wizardState.rawSuccessStateInput,
  ambiguityPointsRemaining: wizardState.ambiguityPointsRemaining.map((point) => ({
    id: point.id,
    label: point.label,
    priority: point.priority
  })),
  resolvedSlots: Object.values(wizardState.followUpAnswers).map((answer) => answer?.slot).filter(Boolean),
  followUpQuestionHistory: wizardState.followUpQuestionHistory.map((item) => ({
    followUpSlot: item.followUpSlot || item.id,
    followUpQuestionText: item.followUpQuestionText || "",
    followUpHelpText: item.followUpHelpText || "",
    followUpOptionsSnapshot: item.followUpOptionsSnapshot || [],
    followUpGeneratedBy: item.followUpGeneratedBy || "fallback_logic"
  })),
  followUpAnswerHistory: wizardState.followUpAnswerHistory,
  followUpAnswers: wizardState.followUpAnswers
});

const generateFollowUpQuestion = async (nextSlot) => {
  const payload = buildFollowUpQuestionPayload(nextSlot);
  logFollowUpInfo("API呼び出し開始", {
    slot: nextSlot,
    historyCount: wizardState.followUpQuestionHistory.length,
    answeredCount: wizardState.followUpAnswerHistory.length
  });
  const response = await fetch("/api/generate-follow-up-question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  logFollowUpInfo("APIレスポンス受信", { slot: nextSlot, status: response.status, ok: response.ok });

  let rawBody = "";
  try {
    rawBody = await response.text();
    logFollowUpInfo("レスポンス本文取得成功", { slot: nextSlot, bodyLength: rawBody.length });
  } catch (error) {
    logFollowUpError("レスポンス本文取得失敗", { slot: nextSlot, error: error?.message || String(error) });
    throw new Error("response_body_read_failed");
  }

  if (!response.ok) {
    logFollowUpError("APIレスポンスがokではありません", { slot: nextSlot, status: response.status, rawBody });
    throw new Error(`response_not_ok:${response.status}`);
  }

  let data;
  try {
    data = JSON.parse(rawBody);
    logFollowUpInfo("JSON parse 成功", { slot: nextSlot });
  } catch (error) {
    logFollowUpError("JSON parse 失敗", { slot: nextSlot, rawBody, error: error?.message || String(error) });
    throw new Error("json_parse_failed");
  }

  if (!data || typeof data !== "object") {
    logFollowUpError("schema不一致: objectでない", { slot: nextSlot, dataType: typeof data });
    throw new Error("schema_invalid:not_object");
  }
  if (data.slot !== nextSlot) {
    logFollowUpError("schema不一致: slot mismatch", { expected: nextSlot, actual: data.slot });
    throw new Error("schema_invalid:slot_mismatch");
  }
  if (typeof data.question_text !== "string" || !data.question_text.trim()) {
    logFollowUpError("schema不一致: question_text が空", { slot: nextSlot });
    throw new Error("schema_invalid:question_text_empty");
  }
  if (!Array.isArray(data.options) || data.options.length < 3 || data.options.length > 5) {
    logFollowUpError("schema不一致: options size が不正", { slot: nextSlot, optionsCount: data.options?.length });
    throw new Error("schema_invalid:options_size");
  }
  if (data.options.some((opt) => !opt || typeof opt !== "object" || !String(opt.id || "").trim() || !String(opt.label || "").trim())) {
    logFollowUpError("schema不一致: options item が不正", { slot: nextSlot });
    throw new Error("schema_invalid:options_item");
  }
  return {
    slot: data.slot,
    questionText: normalizeQuestionCopy((data.question_text || "").trim()),
    helpText: (data.help_text || "").trim(),
    options: data.options.map((opt) => ({
      id: String(opt.id || "").trim(),
      label: normalizeOptionLabel(String(opt.label || "").trim())
    })).filter((opt) => opt.id && opt.label),
    allowOtherText: data.allow_other_text !== false
  };
};

const buildFallbackQuestionRecord = (slot) => {
  const fallback = FOLLOW_UP_BY_ID.get(slot);
  if (!fallback) return null;
  return {
    id: slot,
    ambiguityLabel: fallback.ambiguityLabel || slot,
    followUpGeneratedBy: "fallback_logic",
    followUpSlot: slot,
    followUpQuestionText: normalizeQuestionCopy(fallback.text),
    followUpHelpText: "",
    followUpOptionsSnapshot: fallback.options.map((option) => ({ ...option, label: normalizeOptionLabel(option.label) })),
    allowOtherText: true
  };
};

const createQuestionRecordForSlot = async (slot, ambiguityLabel) => {
  try {
    const generated = await generateFollowUpQuestion(slot);
    if (!generated.questionText || generated.options.length < 3) throw new Error("insufficient_generation");
    return {
      id: slot,
      ambiguityLabel,
      followUpGeneratedBy: "ai",
      followUpSlot: slot,
      followUpQuestionText: generated.questionText,
      followUpHelpText: generated.helpText,
      followUpOptionsSnapshot: generated.options,
      allowOtherText: generated.allowOtherText
    };
  } catch (error) {
    const fallbackRecord = buildFallbackQuestionRecord(slot);
    logFollowUpError("AI質問生成失敗 -> fallback切替", {
      slot,
      reason: error?.message || String(error),
      fallbackReady: Boolean(fallbackRecord)
    });
    if (fallbackRecord) {
      setStatus("AI質問の生成に失敗したため、通常質問へ切り替えました。", false);
      return fallbackRecord;
    }
    return null;
  }
};

const canGenerateKgiNow = () => {
  recomputeRequiredSlotState();
  const hasDeadline = Boolean(wizardState.kgiDeadline);
  const hasSuccessState = Boolean(wizardState.rawSuccessStateInput);
  return hasDeadline
    && hasSuccessState
    && wizardState.missingRequiredSlots.length === 0
    && wizardState.followUpCount >= wizardState.minimumQuestionCountForGenre;
};

const isCrossDeadlinePhrase = (raw) => /継続|安定|維持|毎月|ずっと|習慣/.test(raw);

const resolveAnswerLabel = (question, answer) => {
  if (!answer) return "";
  if (answer.selectedOptionId === "other") return answer.otherText || "その他";
  return question.options.find((opt) => opt.id === answer.selectedOptionId)?.label || "";
};

const collectAnswerSummaries = () => wizardState.followUpQuestionHistory.map((historyItem) => {
  const question = getQuestionRecord(historyItem.id);
  if (!question) return null;
  const answer = wizardState.followUpAnswers[question.id];
  if (!answer?.selectedOptionId) return null;
  return {
    id: question.id,
    question: question.text,
    selectedOptionId: answer.selectedOptionId,
    selectedOptionLabel: resolveAnswerLabel(question, answer),
    rawOtherText: answer.selectedOptionId === "other" ? (answer.otherText || "").trim() : ""
  };
}).filter(Boolean);

const findAnswerById = (answers, id) => answers.find((answer) => answer.id === id);

const inferProductShape = (serviceTypeLabel = "") => {
  if (serviceTypeLabel.includes("ブログ")) return "ブログ型";
  if (serviceTypeLabel.includes("SNS")) return "SNS発信型";
  if (serviceTypeLabel.includes("YouTube")) return "動画メディア型";
  if (serviceTypeLabel.includes("アプリ") || serviceTypeLabel.includes("ツール")) return "ツール提供型";
  if (serviceTypeLabel.includes("相談") || serviceTypeLabel.includes("代行")) return "相談・代行型";
  if (serviceTypeLabel.includes("デジタル商品")) return "デジタル商品販売型";
  if (serviceTypeLabel.includes("物販")) return "物販型";
  return "情報提供型（仮説）";
};

const buildSourceDataNarrative = (sourceData, genreKey = wizardState.genreKey) => getSourceDataSections(sourceData, genreKey)
  .map((item) => `- ${item.label}: ${item.value || "未入力"}`)
  .join("\n");

const ensureRequiredSourceDataFields = (sourceData) => ({
  upperGoal: sourceData.upperGoal || wizardState.upperGoal || "",
  currentKgiScope: sourceData.currentKgiScope || `${wizardState.kgiDeadline}までの到達点`,
  concreteDeliverable: sourceData.concreteDeliverable || "",
  productShape: sourceData.productShape || "",
  contentScope: Array.isArray(sourceData.contentScope) ? sourceData.contentScope : [String(sourceData.contentScope || "")].filter(Boolean),
  audienceSummary: sourceData.audienceSummary || "",
  valuePromise: sourceData.valuePromise || "",
  minimumReleaseBundle: Array.isArray(sourceData.minimumReleaseBundle) ? sourceData.minimumReleaseBundle : [String(sourceData.minimumReleaseBundle || "")].filter(Boolean),
  idealReleaseBundle: Array.isArray(sourceData.idealReleaseBundle) ? sourceData.idealReleaseBundle : [String(sourceData.idealReleaseBundle || "")].filter(Boolean),
  hardRequirements: Array.isArray(sourceData.hardRequirements) ? sourceData.hardRequirements : [String(sourceData.hardRequirements || "")].filter(Boolean),
  optionalRequirements: Array.isArray(sourceData.optionalRequirements) ? sourceData.optionalRequirements : [String(sourceData.optionalRequirements || "")].filter(Boolean),
  excludedFromCurrentKgi: Array.isArray(sourceData.excludedFromCurrentKgi) ? sourceData.excludedFromCurrentKgi : [String(sourceData.excludedFromCurrentKgi || "")].filter(Boolean),
  nextKgiSuggestion: sourceData.nextKgiSuggestion || "",
  sourceDataNarrative: sourceData.sourceDataNarrative || buildSourceDataNarrative(sourceData)
});

const buildAiKgiSourceData = () => {
  recomputeRequiredSlotState();
  const required = wizardState.requiredSlotsByGenre || [];
  const slotValues = Object.fromEntries(required.map((slot) => [slot, getSlotValue(slot) || ""]));
  const sourceData = {
    upperGoal: wizardState.upperGoal || "",
    kgiDeadline: wizardState.kgiDeadline,
    currentKgiScope: wizardState.currentKgiScope || `${wizardState.kgiDeadline}時点で達成判定できる範囲`,
    ...slotValues,
    minimumReleaseBundle: [slotValues.minimumReleaseBundle || slotValues.minimumServiceLaunchLine || slotValues.minimumAchievementLine || ""].filter(Boolean),
    idealReleaseBundle: [getSlotValue("idealReleaseBundle") || ""].filter(Boolean),
    hardRequirements: [slotValues.hardRequirements || ""].filter(Boolean),
    optionalRequirements: [getSlotValue("monetizationPreparation") || ""].filter(Boolean),
    excludedFromCurrentKgi: [slotValues.excludedFromCurrentKgi || ""].filter(Boolean),
    nextKgiSuggestion: getSlotValue("nextKgiSuggestion") || "",
    whyThisStructure: "必須スロットを先に埋めてから、今回範囲と次回範囲を分離したため。"
  };
  if (isInvestmentGenreKey()) {
    sourceData.concreteDeliverable = sourceData.successDefinition || sourceData.concreteDeliverable || "";
    sourceData.audienceSummary = "";
    sourceData.valuePromise = "";
    sourceData.minimumReleaseBundle = [];
    sourceData.idealReleaseBundle = [];
    sourceData.productShape = "";
    sourceData.contentScope = [];
  } else {
    sourceData.concreteDeliverable = sourceData.concreteDeliverable || sourceData.serviceSummary || "";
    sourceData.audienceSummary = sourceData.audienceSummary || sourceData.targetBuyer || sourceData.targetClient || sourceData.targetBehavior || "";
    sourceData.valuePromise = sourceData.valuePromise || "";
  }
  sourceData.sourceDataNarrative = buildSourceDataNarrative(sourceData, wizardState.genreKey);
  wizardState.aiKgiSourceData = sourceData;
  wizardState.clarifiedSuccessState = `${wizardState.kgiDeadline}時点の達成条件をsource dataとして整理`;
  wizardState.nextKgiSuggestion = sourceData.nextKgiSuggestion;
  wizardState.sourceDataReady = true;
  return sourceData;
};

const buildKgiSourceData = () => {
  buildAiKgiSourceData();
};

const getQualityGateIssues = () => {
  const sourceData = wizardState.aiKgiSourceData;
  const issues = [];
  if (!sourceData) return ["KGI元データが未生成です"];
  recomputeRequiredSlotState();
  if (wizardState.missingRequiredSlots.length > 0) {
    issues.push(...wizardState.missingRequiredSlots.map((slot) => `${SLOT_LABELS[slot] || slot}が未確定です`));
  }
  const textCandidates = [
    sourceData.sourceDataNarrative,
    wizardState.kgiStatement,
    ...(wizardState.kgiSuccessCriteria || []),
    ...Object.values(sourceData).flatMap((value) => Array.isArray(value) ? value : [value])
  ].filter(Boolean).map(String);
  BLOCKED_PHRASES.forEach((phrase) => {
    if (textCandidates.some((text) => text.includes(phrase))) issues.push(`禁止語句を検知: ${phrase}`);
  });
  if (isInvestmentGenreKey()) {
    const nonInvestmentFields = [sourceData.audienceSummary, sourceData.valuePromise, sourceData.productShape, (sourceData.contentScope || []).join("、"), (sourceData.minimumReleaseBundle || []).join("、")];
    if (nonInvestmentFields.some((v) => String(v || "").trim())) issues.push("投資型に不適切な公開/読者系項目が混在");
  }
  const hasConcreteCriteria = (wizardState.kgiSuccessCriteria || []).every((item) => /\d|期限|市場|単位|ルール|定義/.test(item));
  if (wizardState.kgiSuccessCriteria.length > 0 && !hasConcreteCriteria) issues.push("判定条件が具体的でない");
  if (!sourceData.minimumReleaseBundle?.length && !sourceData.minimumServiceLaunchLine && !sourceData.minimumAchievementLine) {
    issues.push("最低ラインが曖昧");
  }
  return Array.from(new Set(issues));
};

const applyQualityGate = () => {
  const issues = getQualityGateIssues();
  if (issues.length === 0) return { pass: true, issues: [] };
  console.warn("[KGI_QUALITY_GATE] blocked", { issues, genre: wizardState.genreKey });
  return { pass: false, issues };
};

const buildKgiStatementAndCriteria = () => {
  const sourceData = wizardState.aiKgiSourceData;
  if (!sourceData) return;
  if (isInvestmentGenreKey()) {
    wizardState.kgiStatement = `${sourceData.kgiDeadline}までに、${sourceData.targetMarket}の取引において${sourceData.measurementUnit}収支を記録し、${sourceData.successDefinition}を${sourceData.stabilityDefinition}の条件で達成する。`;
    wizardState.kgiSuccessCriteria = [
      `期限日（${sourceData.kgiDeadline}）までに達成判定できる`,
      `月次収支などの測定単位: ${sourceData.measurementUnit}`,
      `対象市場: ${sourceData.targetMarket}`,
      `取引スタイル/ルール: ${sourceData.tradingStyleOrRuleBasis}`,
      `安定の定義: ${sourceData.stabilityDefinition}`,
      `除外条件: ${(sourceData.excludedFromCurrentKgi || []).join("、") || "特になし"}`
    ];
  } else {
    const mainDeliverable = sourceData.concreteDeliverable || sourceData.serviceSummary || "成果";
    const minimumLine = (sourceData.minimumReleaseBundle || [])[0] || sourceData.minimumServiceLaunchLine || sourceData.minimumAchievementLine || "";
    const provisionalCriterion = buildProvisionalCriterionByGenre(sourceData);
    wizardState.kgiStatement = `${sourceData.kgiDeadline}時点で、${mainDeliverable}について「達成した/未達」を判定できる成功ラインを満たしている。`;
    wizardState.kgiSuccessCriteria = [
      `期限日（${sourceData.kgiDeadline}）時点で達成判定できる`,
      `仮の判定条件案: ${provisionalCriterion}`,
      `必須条件: ${(sourceData.hardRequirements || []).join("、")}`,
      `最低ライン: ${minimumLine}`,
      `今回除外: ${(sourceData.excludedFromCurrentKgi || []).join("、") || "特になし"}`
    ];
  }
};

const buildGapAnalysis = () => {
  const missing = wizardState.missingRequiredSlots;
  const gate = applyQualityGate();
  wizardState.gapAnalysis = {
    alreadyDone: ["KGI元データの主要項目が整理済み"],
    notDoneYet: gate.pass ? (missing.length ? missing.map((slot) => `${slot} が未充足`) : ["必須スロットは充足"]) : gate.issues,
    firstBigMountain: "最低ラインを期限内で観測可能にする",
    gapToCloseForCurrentKgi: missing.length ? missing : ["達成判定条件の運用準備"]
  };
};

const buildKpiDrafts = () => {
  const gaps = wizardState.gapAnalysis?.gapToCloseForCurrentKgi || [];
  wizardState.kpiDrafts = gaps.map((gap) => `${gap} の充足率を週次で記録する`);
};

const updateSpecificityButtonState = () => {
  const gate = applyQualityGate();
  if (!saveWithSpecificityButton) return;
  saveWithSpecificityButton.textContent = gate.pass ? "この補正を反映して保存" : "この補正を編集欄に反映";
};

const pickPriorityGateIssue = (issues = []) => {
  const criteriaIssue = issues.find((issue) => /判定条件が具体的でない|最低ラインが曖昧|公開条件が曖昧|成功定義が曖昧|利益の測定単位が曖昧|安定の定義が曖昧/.test(issue));
  return criteriaIssue || issues[0] || "";
};

const inferNumericSuccessLine = () => {
  const raw = `${wizardState.rawSuccessStateInput || ""} ${(wizardState.aiKgiSourceData?.valuePromise || "")}`.replace(/\s+/g, " ");
  const directNumberMatch = raw.match(/(\d+(?:\.\d+)?)\s*(万円|円|件|人|本|回|%|％)/);
  if (directNumberMatch) return `${directNumberMatch[1]}${directNumberMatch[2]}`;
  if (/売上|収益|収入/.test(raw)) return "1万円";
  if (/申込|受注|契約/.test(raw)) return "1件";
  if (/投稿|記事|動画|発信/.test(raw)) return "10本";
  if (/習慣|継続|実行/.test(raw)) return "80%";
  return "1件";
};

const buildProvisionalCriterionByGenre = (sourceData) => {
  const deadline = sourceData.kgiDeadline || wizardState.kgiDeadline;
  const deliverable = sourceData.concreteDeliverable || sourceData.serviceSummary || "目標対象";
  const numericLine = inferNumericSuccessLine();
  if (wizardState.genreKey === "product") return `${deadline}時点で副業経由の月売上${numericLine}を達成している`;
  if (wizardState.genreKey === "media") return `${deadline}時点で「${deliverable}」が公開済みで、主要導線から到達できる状態である`;
  if (wizardState.genreKey === "service") return `${deadline}時点で申込み導線が稼働し、受注可能状態である（最低${numericLine}目標）`;
  if (wizardState.genreKey === "investment") return `${deadline}時点で${sourceData.measurementUnit || "月次"}損益が${sourceData.successDefinition || "プラス"}で判定できる`;
  if (wizardState.genreKey === "selfImprovement") return `${deadline}時点で${sourceData.measurementUnit || "週次"}の実行率${numericLine}以上を達成している`;
  return `${deadline}時点で「${deliverable}」の達成判定ができる具体条件を1つ以上満たしている`;
};

let isMovingToMissingQuestion = false;
const pickFirstExistingQuestionIndex = () => Math.max(0, wizardState.followUpQuestionHistory.length - 1);

const getCriteriaSlotsByGenre = (genre) => CRITERIA_SLOT_FAMILY_BY_GENRE[genre] || CRITERIA_SLOT_FAMILY_BY_GENRE.other;

const normalizeMissingReasonKey = (reason = "") => String(reason || "").trim() || "__none__";

const selectSlotFromPriority = (priority = [], candidates = []) => {
  if (!Array.isArray(priority) || priority.length === 0) return null;
  const strict = priority.find((id) => candidates.includes(id));
  if (strict) return strict;
  return priority.find((id) => FOLLOW_UP_BY_ID.has(id)) || null;
};

const buildCriteriaRetryQuestionRecord = (slot, reason) => {
  const slotLabel = SLOT_LABELS[slot] || "判定条件";
  return {
    id: slot,
    ambiguityLabel: slotLabel,
    followUpGeneratedBy: "criteria_retry_logic",
    followUpSlot: slot,
    followUpQuestionText: `${slotLabel}がまだ曖昧です。成功判定に使う数字を1つ決めてください。`,
    followUpHelpText: `不足理由: ${reason || "判定条件が具体的でない"}。数値が難しければ「その他」で短く入力してください。`,
    followUpOptionsSnapshot: [
      { id: "criteria_retry_minimum", label: "最低ラインの数値を1つ決める（例: 1件 / 10本 / 80%）", recommended: true },
      { id: "criteria_retry_measure", label: "判定単位を固定する（例: 週次 / 月次）" },
      { id: "criteria_retry_with_condition", label: "数値+必須条件をセットで決める" },
      { id: "other", label: "具体的な数字を入力する" }
    ],
    allowOtherText: true
  };
};

const buildMinimumLineEmergencyQuestionRecord = (slot) => ({
  id: slot,
  ambiguityLabel: SLOT_LABELS[slot] || "最低ライン",
  followUpGeneratedBy: "loop_guard",
  followUpSlot: slot,
  followUpQuestionText: "保存のため、最低ラインだけ数字で決めてください。",
  followUpHelpText: "最低ラインを1つ決めると次へ進めます。迷う場合は最小の数値で構いません。",
  followUpOptionsSnapshot: [
    { id: "minimum_emergency_1", label: "まずは最低 1件（または同等の1単位）にする", recommended: true },
    { id: "minimum_emergency_3", label: "最低 3件（または同等の3単位）にする" },
    { id: "minimum_emergency_rate", label: "最低 80%（実行率など）にする" },
    { id: "other", label: "具体的な数字を入力する" }
  ],
  allowOtherText: true
});

const upsertQuestionRecord = (questionRecord) => {
  if (!questionRecord?.id) return -1;
  const existingIndex = wizardState.followUpQuestionHistory.findIndex((item) => item.id === questionRecord.id);
  if (existingIndex >= 0) {
    wizardState.followUpQuestionHistory[existingIndex] = questionRecord;
    return existingIndex;
  }
  wizardState.followUpQuestionHistory.push(questionRecord);
  return wizardState.followUpQuestionHistory.length - 1;
};

const resolveMissingReasonToSlot = (reason, genre, missingRequiredSlots, sourceData) => {
  const candidates = [...(missingRequiredSlots || [])].filter((slot) => FOLLOW_UP_BY_ID.has(slot));
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) return candidates[0] || null;

  if (/最低ラインが曖昧/.test(normalizedReason)) {
    const criteriaPriority = getCriteriaSlotsByGenre(genre);
    return selectSlotFromPriority(criteriaPriority, candidates) || candidates[0] || null;
  }
  if (/判定条件が具体的でない/.test(normalizedReason)) {
    const criteriaPriority = getCriteriaSlotsByGenre(genre);
    return selectSlotFromPriority(criteriaPriority, candidates) || candidates[0] || null;
  }

  const labelHit = Object.entries(SLOT_LABELS).find(([, label]) => normalizedReason.includes(`${label}が未確定`));
  if (labelHit && candidates.includes(labelHit[0])) return labelHit[0];

  const slotInReason = Object.keys(SLOT_LABELS).find((slot) => normalizedReason.includes(slot));
  if (slotInReason && candidates.includes(slotInReason)) return slotInReason;

  const byLabel = Object.keys(SLOT_ID_BY_LABEL).find((label) => normalizedReason.includes(label));
  if (byLabel && candidates.includes(SLOT_ID_BY_LABEL[byLabel])) return SLOT_ID_BY_LABEL[byLabel];

  for (const rule of MISSING_REASON_TO_SLOT_HINTS) {
    if (!rule.matcher.test(normalizedReason)) continue;
    const priority = rule.slotsByGenre?.[genre] || rule.slotsByGenre?.other || [];
    const slot = selectSlotFromPriority(priority, candidates);
    if (slot) return slot;
  }

  if (sourceData && /公開/.test(normalizedReason)) {
    const publishCandidate = ["publishDefinition", "publishOrSalesDefinition", "applicationDefinition"].find((id) => candidates.includes(id));
    if (publishCandidate) return publishCandidate;
  }
  return candidates[0] || null;
};

const revertToQuestionList = async () => {
  const fallbackSlot = wizardState.requiredSlotsByGenre.find((slot) => FOLLOW_UP_BY_ID.has(slot) && !wizardState.followUpQuestionHistory.some((q) => q.id === slot));
  if (wizardState.followUpQuestionHistory.length === 0 && fallbackSlot) {
    const emergency = buildFallbackQuestionRecord(fallbackSlot);
    if (emergency) wizardState.followUpQuestionHistory.push(emergency);
  }
  wizardState.currentQuestionIndex = pickFirstExistingQuestionIndex();
  proposalSection.classList.add("hidden");
  questionSection.classList.remove("hidden");
  sourceDataApproveButton.disabled = true;
  renderQuestion();
  setStep(2);
  await syncPersistence();
  setStatus("不足項目用の質問生成に失敗したため、質問一覧に戻りました。続きから見直してください。", true);
  logMissingFlowError("reverted to question list", { questionCount: wizardState.followUpQuestionHistory.length, currentQuestionIndex: wizardState.currentQuestionIndex });
};

const goToMissingQuestion = async () => {
  if (isMovingToMissingQuestion) return;
  isMovingToMissingQuestion = true;
  logMissingFlowInfo("button clicked");
  setStatus("不足している項目に戻ります...", false);
  try {
    recomputeRequiredSlotState();
    const gate = applyQualityGate();
    const firstIssue = pickPriorityGateIssue(gate.issues);
    const issueKey = normalizeMissingReasonKey(firstIssue);
    wizardState.missingReasonLoopCounts[issueKey] = (wizardState.missingReasonLoopCounts[issueKey] || 0) + 1;
    const loopCount = wizardState.missingReasonLoopCounts[issueKey];
    const resolvedSlot = resolveMissingReasonToSlot(firstIssue, wizardState.genreKey, wizardState.missingRequiredSlots, wizardState.aiKgiSourceData);
    const targetSlot = resolvedSlot || wizardState.missingRequiredSlots.find((slot) => FOLLOW_UP_BY_ID.has(slot));
    wizardState.missingReasonLastIssue = firstIssue || "";
    wizardState.missingReasonLastResolvedSlot = targetSlot || "";
    logMissingFlowInfo("resolved slot", {
      issue: firstIssue,
      resolvedSlot: resolvedSlot,
      slot: targetSlot,
      loopCount,
      missingRequiredSlots: wizardState.missingRequiredSlots
    });
    if (!targetSlot) {
      logMissingFlowError("failed reason", { reason: "slot_not_resolved", issue: firstIssue });
      await revertToQuestionList();
      return;
    }

    const shouldApplyLoopGuard = CRITERIA_REASON_PATTERN.test(String(firstIssue || "")) && loopCount >= 2;
    const shouldUseCriteriaRetry = CRITERIA_REASON_PATTERN.test(String(firstIssue || "")) && loopCount === 1;
    if (shouldApplyLoopGuard) {
      const emergencyRecord = buildMinimumLineEmergencyQuestionRecord(targetSlot);
      const idx = upsertQuestionRecord(emergencyRecord);
      wizardState.currentQuestionIndex = idx;
      proposalSection.classList.add("hidden");
      questionSection.classList.remove("hidden");
      sourceDataApproveButton.disabled = true;
      renderQuestion();
      setStep(2);
      await syncPersistence();
      logMissingFlowInfo("loop guard activated", {
        issue: firstIssue,
        resolvedSlot: resolvedSlot,
        actualNextQuestionSlot: emergencyRecord.id,
        loopCount
      });
      setStatus("同じ不足理由が続いたため、緊急質問に切り替えました。最低ラインを数字で決めてください。", true);
      return;
    }

    if (shouldUseCriteriaRetry) {
      const retryRecord = buildCriteriaRetryQuestionRecord(targetSlot, firstIssue);
      const idx = upsertQuestionRecord(retryRecord);
      wizardState.currentQuestionIndex = idx;
      proposalSection.classList.add("hidden");
      questionSection.classList.remove("hidden");
      sourceDataApproveButton.disabled = true;
      renderQuestion();
      setStep(2);
      await syncPersistence();
      logMissingFlowInfo("criteria retry activated", {
        issue: firstIssue,
        resolvedSlot: resolvedSlot,
        actualNextQuestionSlot: retryRecord.id,
        loopCount
      });
      setStatus(`判定条件の不足を解消するため、${SLOT_LABELS[targetSlot] || targetSlot}の再質問に切り替えました。`, false);
      return;
    }

    const existingIndex = wizardState.followUpQuestionHistory.findIndex((item) => item.id === targetSlot);
    if (existingIndex >= 0) {
      wizardState.currentQuestionIndex = existingIndex;
      proposalSection.classList.add("hidden");
      questionSection.classList.remove("hidden");
      sourceDataApproveButton.disabled = true;
      renderQuestion();
      setStep(2);
      await syncPersistence();
      logMissingFlowInfo("navigated to existing question", { issue: firstIssue, resolvedSlot, actualNextQuestionSlot: targetSlot });
      setStatus(`あと1つ決めると保存できます。${SLOT_LABELS[targetSlot] || targetSlot}を具体化する質問に進みます。`, false);
      return;
    }

    const questionRecord = await createQuestionRecordForSlot(targetSlot, SLOT_LABELS[targetSlot] || targetSlot);
    if (questionRecord) {
      wizardState.followUpQuestionHistory.push(questionRecord);
      wizardState.currentQuestionIndex = wizardState.followUpQuestionHistory.length - 1;
      logMissingFlowInfo(questionRecord.followUpGeneratedBy === "ai" ? "ai question generated" : "fallback question used", { slot: targetSlot });
      proposalSection.classList.add("hidden");
      questionSection.classList.remove("hidden");
      sourceDataApproveButton.disabled = true;
      renderQuestion();
      setStep(2);
      await syncPersistence();
      logMissingFlowInfo("navigated to generated question", { issue: firstIssue, resolvedSlot, actualNextQuestionSlot: questionRecord.id });
      setStatus(`あと1つ決めると保存できます。${SLOT_LABELS[targetSlot] || targetSlot}を具体化する質問に進みます。`, false);
      return;
    }

    const directFallback = buildFallbackQuestionRecord(targetSlot);
    if (directFallback) {
      wizardState.followUpQuestionHistory.push(directFallback);
      wizardState.currentQuestionIndex = wizardState.followUpQuestionHistory.length - 1;
      logMissingFlowInfo("fallback question used", { slot: targetSlot, fallback: "direct_slot_fallback" });
      proposalSection.classList.add("hidden");
      questionSection.classList.remove("hidden");
      sourceDataApproveButton.disabled = true;
      renderQuestion();
      setStep(2);
      await syncPersistence();
      logMissingFlowInfo("navigated to fallback question", { issue: firstIssue, resolvedSlot, actualNextQuestionSlot: directFallback.id });
      setStatus("質問生成に失敗したため、通常質問へ切り替えました。", true);
      return;
    }

    logMissingFlowError("failed reason", { reason: "question_generation_and_fallback_failed", slot: targetSlot });
    await revertToQuestionList();
  } catch (error) {
    logMissingFlowError("failed reason", { reason: error?.message || String(error) });
    await revertToQuestionList();
  } finally {
    isMovingToMissingQuestion = false;
  }
};

const renderQuestion = () => {
  const questionId = wizardState.followUpQuestionHistory[wizardState.currentQuestionIndex]?.id;
  const question = getQuestionRecord(questionId);
  if (!question) return;
  logFollowUpInfo("画面反映", {
    currentQuestionIndex: wizardState.currentQuestionIndex,
    questionId: question.id,
    slot: question.id
  });

  const remainingToMinimum = Math.max(0, wizardState.minimumQuestionCountForGenre - wizardState.followUpCount);
  questionProgress.textContent = `質問 ${wizardState.currentQuestionIndex + 1} / 最大${wizardState.maxFollowUpQuestions}（目安あと${remainingToMinimum}問）`;
  questionText.textContent = question.text;
  if (questionHelpText) {
    const help = question.helpText || "";
    questionHelpText.textContent = help;
    questionHelpText.classList.toggle("hidden", !help);
  }
  questionAnswerInput.value = "";
  questionAnswerInput.classList.add("hidden");

  questionOptions.innerHTML = "";
  const answer = wizardState.followUpAnswers[question.id] || {};
  question.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "option-row";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `question-${question.id}`;
    input.value = option.id;
    if (answer.selectedOptionId === option.id) input.checked = true;
    input.addEventListener("change", () => {
      wizardState.followUpAnswers[question.id] = {
        slot: question.id,
        selectedOptionId: option.id,
        selectedOptionLabel: option.label,
        otherText: option.id === "other" ? (otherAnswerInput.value || "").trim() : "",
        followUpSelectedOptionId: option.id,
        followUpSelectedOptionLabel: option.label,
        followUpOtherText: option.id === "other" ? (otherAnswerInput.value || "").trim() : ""
      };
      otherAnswerField.classList.toggle("hidden", option.id !== "other" || !question.allowOtherText);
      if (option.id !== "other") otherAnswerInput.value = "";
      persistDraftToLocal();
    });
    const wrapper = document.createElement("div");
    wrapper.className = "option-label-wrap";
    const span = document.createElement("span");
    span.textContent = option.label;
    wrapper.appendChild(span);
    const isRecommended = option.recommended === true || (index === 0 && option.id !== "other");
    if (isRecommended) {
      const badge = document.createElement("span");
      badge.className = "option-recommended";
      badge.textContent = "推奨";
      const note = document.createElement("p");
      note.className = "option-recommended-note";
      note.textContent = option.recommendReason || "この目標なら、まずはここからが現実的です。";
      wrapper.append(badge, note);
    }
    label.append(input, wrapper);
    questionOptions.appendChild(label);
  });

  const showOther = answer.selectedOptionId === "other" && question.allowOtherText;
  otherAnswerField.classList.toggle("hidden", !showOther);
  otherAnswerInput.value = answer.otherText || "";

  prevQuestionButton.disabled = wizardState.currentQuestionIndex === 0;
  nextQuestionButton.textContent = wizardState.currentQuestionIndex === wizardState.followUpQuestionHistory.length - 1 ? "次へ" : "次の質問へ";
  if (isAdvancingQuestion) {
    nextQuestionButton.disabled = true;
    nextQuestionButton.textContent = "処理中...";
  } else {
    nextQuestionButton.disabled = false;
  }
};

const renderProposal = () => {
  const sourceData = wizardState.aiKgiSourceData;
  const genreInfo = wizardState.genreClassification;
  const gap = wizardState.gapAnalysis;
  const gate = applyQualityGate();
  if (!hasRenderableSourceData()) {
    understandingCheckSection.classList.remove("hidden");
    understandingCheckSection.innerHTML = `
      <h3>KGI元データの生成に失敗しました</h3>
      <p class="proposal-meta">KGI元データの生成に失敗しましたが、回答内容は保存されています。</p>
      <p class="proposal-meta">ステップ2に戻って再試行してください。</p>
    `;
    proposalList.innerHTML = "";
    proposalList.classList.add("hidden");
    sourceDataApproveButton?.classList.add("hidden");
    sourceDataApproveButton.disabled = true;
    sourceDataBackButton?.classList.remove("hidden");
    editSection.classList.add("hidden");
    setStep(2);
    renderRecoveryCard();
    return;
  }
  sourceDataApproveButton.disabled = !gate.pass;
  if (sourceData) {
    understandingCheckSection.classList.remove("hidden");
    const remainingAmbiguity = (sourceData.ambiguityPointsRemaining || []).length > 0
      ? sourceData.ambiguityPointsRemaining.join("、")
      : "特になし";
    const sourceSectionsHtml = getSourceDataSections(sourceData, wizardState.genreKey)
      .map((item) => `<p class="proposal-meta"><strong>${item.label}:</strong> ${item.value || "未入力"}</p>`)
      .join("");
    const gateHtml = !gate.pass ? `
      <div class="proposal-meta">
        <p><strong>あと1つ決めると保存できます</strong></p>
        <p>成功ラインを数字や判定条件で決めましょう。次の点を埋めると保存できます。</p>
        <ul>${gate.issues.map((issue) => `<li>${issue}</li>`).join("")}</ul>
        <div class="proposal-actions-inline">
          <button id="goToMissingSlotButton" type="button">判定条件を具体化する質問に進む</button>
          <button id="reviewQuestionsButton" class="secondary" type="button">内容全体を見直すために質問一覧へ戻る</button>
        </div>
      </div>
    ` : "";
    understandingCheckSection.innerHTML = `
      <h3>まず確認: 今回のKGIの具体案</h3>
      ${genreInfo ? `<p class="proposal-meta"><strong>AIジャンル判定:</strong> ${genreInfo.primaryGenre}（根拠: ${genreInfo.reason || "文脈判定"}）</p>` : ""}
      ${genreInfo?.multipleKgiDetected ? `<p class="proposal-meta"><strong>KGI分割提案:</strong> ${genreInfo.splitSuggestion || "複数KGIに分ける提案あり"}</p>` : ""}
      ${sourceSectionsHtml}
      ${gateHtml}
      <details>
        <summary>補足を見る</summary>
        <p class="proposal-meta"><strong>要約（sourceDataNarrative）:</strong><br>${sourceData.sourceDataNarrative.replaceAll("\n", "<br>")}</p>
        <p class="proposal-meta"><strong>曖昧さの残り:</strong> ${remainingAmbiguity}</p>
        <p class="proposal-meta"><strong>この整理にした理由:</strong> ${sourceData.whyThisStructure}</p>
      </details>
    `;
  }

  proposalList.innerHTML = "";
  const card = document.createElement("article");
  card.className = "proposal-card selected";

  const criteriaHtml = wizardState.kgiSuccessCriteria.map((item) => `<li>${item}</li>`).join("");
  const nextKgiHtml = wizardState.nextKgiSuggestion
    ? `<p class="proposal-meta"><strong>次のKGI候補:</strong> ${wizardState.nextKgiSuggestion}</p>`
    : "";
  const gapHtml = gap ? `
    <p class="proposal-meta"><strong>差分整理（KGI→差分→KPI）:</strong></p>
    <ul class="proposal-meta">
      <li>もうできているもの: ${(gap.alreadyDone || []).join("、") || "なし"}</li>
      <li>まだできていないもの: ${(gap.notDoneYet || []).join("、") || "なし"}</li>
      <li>最初の大きな山: ${gap.firstBigMountain || "要確認"}</li>
      <li>今回KGIまでに埋める差分: ${(gap.gapToCloseForCurrentKgi || []).join("、") || "要確認"}</li>
    </ul>
  ` : "";
  const kpiHtml = wizardState.kpiDrafts.length
    ? `<p class="proposal-meta"><strong>KPI下書き（差分整理のあとに生成）:</strong></p><ul class="proposal-meta">${wizardState.kpiDrafts.map((item) => `<li>${item}</li>`).join("")}</ul>`
    : "";

  card.innerHTML = `
    <h3>${isInvestmentGenreKey() ? "投資・トレードKGI候補" : "KGI候補"}</h3>
    <p class="proposal-meta"><strong>KGI本体:</strong> ${wizardState.kgiStatement}</p>
    <p class="proposal-meta"><strong>KGI達成の判定条件:</strong></p>
    <ul class="proposal-meta">${criteriaHtml}</ul>
    <p class="proposal-meta"><strong>整理した達成状態:</strong> ${wizardState.clarifiedSuccessState}</p>
    ${gapHtml}
    ${kpiHtml}
    ${nextKgiHtml}
  `;

  proposalList.appendChild(card);
  proposalList.classList.toggle("hidden", !wizardState.sourceDataConfirmed);
  sourceDataApproveButton?.classList.toggle("hidden", wizardState.sourceDataConfirmed);
  sourceDataBackButton?.classList.toggle("hidden", wizardState.sourceDataConfirmed);

  const defaultName = `${wizardState.kgiDeadline} KGI`;
  wizardState.selectedDraft = {
    name: defaultName,
    goalText: `${wizardState.kgiStatement}\n\nKGI達成の判定条件:\n- ${wizardState.kgiSuccessCriteria.join("\n- ")}`,
    deadline: wizardState.kgiDeadline,
    level: "easy"
  };

  nameInput.value = wizardState.selectedDraft.name;
  goalTextInput.value = wizardState.selectedDraft.goalText;
  deadlineInput.value = wizardState.selectedDraft.deadline;
  levelInput.value = wizardState.selectedDraft.level;
  editSection.classList.toggle("hidden", !wizardState.sourceDataConfirmed);
  saveButton.disabled = !wizardState.sourceDataConfirmed || !gate.pass;
  if (!gate.pass && wizardState.sourceDataConfirmed) {
    setStatus("あと1つ決めると保存できます。成功ラインを数字で決める質問へ進んでください。", false);
  }
  updateSpecificityButtonState();
  understandingCheckSection.querySelector("#goToMissingSlotButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
      button.textContent = "不足している項目に戻ります...";
    }
    await goToMissingQuestion();
    if (button instanceof HTMLButtonElement) {
      button.disabled = false;
      button.textContent = "判定条件を具体化する質問に進む";
    }
  });
  understandingCheckSection.querySelector("#reviewQuestionsButton")?.addEventListener("click", () => {
    sourceDataBackButton?.click();
  });
  renderRecoveryCard();
};

const ensureCreationSession = async () => {
  if (!db) return false;
  if (wizardState.sessionId) return true;

  const data = {
    flowVersion: "kgi-wizard-v5-essence-first",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    upperGoal: wizardState.upperGoal,
    kgiDeadline: wizardState.kgiDeadline,
    rawSuccessStateInput: wizardState.rawSuccessStateInput,
    clarifiedSuccessState: "",
    aiKgiSourceData: null,
    kgiStatement: "",
    kgiSuccessCriteria: [],
    ambiguityPoints: wizardState.ambiguityPoints,
    ambiguityPointsInitial: wizardState.ambiguityPointsInitial.map((point) => point.label),
    ambiguityPointsResolved: wizardState.ambiguityPointsResolved.map((point) => point.label),
    ambiguityPointsRemaining: wizardState.ambiguityPointsRemaining.map((point) => point.label),
    followUpQuestions: wizardState.followUpQuestionHistory,
    followUpQuestionHistory: wizardState.followUpQuestionHistory,
    followUpAnswers: {},
    followUpAnswerHistory: wizardState.followUpAnswerHistory,
    followUpStopReason: wizardState.followUpStopReason,
    nextKgiSuggestion: "",
    genreClassification: wizardState.genreClassification,
    gapAnalysis: wizardState.gapAnalysis,
    kpiDrafts: wizardState.kpiDrafts,
    interviewNotes: wizardState.interviewNotes,
    sourceDataConfirmed: wizardState.sourceDataConfirmed,
    sourceDataEdited: wizardState.sourceDataEdited,
    currentKgiScope: wizardState.currentKgiScope,
    requiredSlotsByGenre: wizardState.requiredSlotsByGenre,
    filledSlots: wizardState.filledSlots,
    missingRequiredSlots: wizardState.missingRequiredSlots,
    minimumQuestionCountForGenre: wizardState.minimumQuestionCountForGenre,
    followUpCount: wizardState.followUpCount,
    sourceDataReady: wizardState.sourceDataReady,
    missingReasonLoopCounts: wizardState.missingReasonLoopCounts,
    missingReasonLastIssue: wizardState.missingReasonLastIssue,
    missingReasonLastResolvedSlot: wizardState.missingReasonLastResolvedSlot
  };
  const ref = await addDoc(collection(db, "kgiCreationSessions"), data);
  wizardState.sessionId = ref.id;
  return true;
};

const updateCreationSession = async () => {
  if (!wizardState.sessionId || !db) return;
  await updateDoc(doc(db, "kgiCreationSessions", wizardState.sessionId), {
    updatedAt: serverTimestamp(),
    upperGoal: wizardState.upperGoal,
    kgiDeadline: wizardState.kgiDeadline,
    rawSuccessStateInput: wizardState.rawSuccessStateInput,
    clarifiedSuccessState: wizardState.clarifiedSuccessState,
    aiKgiSourceData: wizardState.aiKgiSourceData,
    kgiStatement: wizardState.kgiStatement,
    kgiSuccessCriteria: wizardState.kgiSuccessCriteria,
    ambiguityPoints: wizardState.ambiguityPoints,
    ambiguityPointsInitial: wizardState.ambiguityPointsInitial.map((point) => point.label),
    ambiguityPointsResolved: wizardState.ambiguityPointsResolved.map((point) => point.label),
    ambiguityPointsRemaining: wizardState.ambiguityPointsRemaining.map((point) => point.label),
    followUpQuestions: wizardState.followUpQuestionHistory,
    followUpQuestionHistory: wizardState.followUpQuestionHistory,
    followUpAnswers: wizardState.followUpAnswers,
    followUpAnswerHistory: wizardState.followUpAnswerHistory,
    followUpStopReason: wizardState.followUpStopReason,
    nextKgiSuggestion: wizardState.nextKgiSuggestion,
    genreClassification: wizardState.genreClassification,
    gapAnalysis: wizardState.gapAnalysis,
    kpiDrafts: wizardState.kpiDrafts,
    interviewNotes: wizardState.interviewNotes,
    sourceDataConfirmed: wizardState.sourceDataConfirmed,
    sourceDataEdited: wizardState.sourceDataEdited,
    currentKgiScope: wizardState.currentKgiScope,
    requiredSlotsByGenre: wizardState.requiredSlotsByGenre,
    filledSlots: wizardState.filledSlots,
    missingRequiredSlots: wizardState.missingRequiredSlots,
    minimumQuestionCountForGenre: wizardState.minimumQuestionCountForGenre,
    followUpCount: wizardState.followUpCount,
    sourceDataReady: wizardState.sourceDataReady,
    missingReasonLoopCounts: wizardState.missingReasonLoopCounts,
    missingReasonLastIssue: wizardState.missingReasonLastIssue,
    missingReasonLastResolvedSlot: wizardState.missingReasonLastResolvedSlot
  });
};

startDeepDiveButton.addEventListener("click", async () => {
  const deadline = (roughDeadlineInput.value || "").trim();
  const successState = (roughGoalInput.value || "").trim();

  if (!deadline) {
    alert("1問目: 期限を入力してください。");
    return;
  }
  if (!successState) {
    alert("2問目: 成功状態を入力してください。");
    return;
  }

  startDeepDiveButton.disabled = true;
  startDeepDiveButton.textContent = "処理中...";
  try {
    clearLocalDraft();
    resetWizardSessionState();
    wizardState.lastError = null;
    wizardState.pendingAction = null;
    wizardState.kgiDeadline = deadline;
    wizardState.rawSuccessStateInput = successState;
    wizardState.upperGoal = pickUpperGoal(successState);
    logSessionInfo("new session started", { fingerprint: getSessionFingerprint(deadline, successState) });
    setStatus("AIがジャンル判定中です...", false);
    const genre = await classifyKgiGenre();
    const genreKey = normalizeGenreKey(genre?.primaryGenre || "");
    wizardState.genreKey = genreKey;
    wizardState.requiredSlotsByGenre = REQUIRED_SLOTS_BY_GENRE[genreKey] || REQUIRED_SLOTS_BY_GENRE.other;
    wizardState.minimumQuestionCountForGenre = MIN_QUESTION_COUNT_BY_GENRE[genreKey] || 4;
    wizardState.currentKgiScope = `${deadline}時点で完結判定できる範囲に限定`;
    wizardState.ambiguityPointsInitial = deriveAmbiguityPoints(successState, genre?.primaryGenre || "");
    wizardState.ambiguityPointsResolved = [];
    wizardState.ambiguityPointsRemaining = [...wizardState.ambiguityPointsInitial];
    wizardState.ambiguityPoints = wizardState.ambiguityPointsRemaining.map((point) => point.label);
    wizardState.maxFollowUpQuestions = Math.max(wizardState.minimumQuestionCountForGenre + 2, wizardState.requiredSlotsByGenre.length + 1);
    wizardState.currentQuestionIndex = 0;
    wizardState.missingRequiredSlots = [...wizardState.requiredSlotsByGenre];

    const firstQuestionPoint = chooseNextQuestion();
    if (firstQuestionPoint) {
      const firstQuestionRecord = await createQuestionRecordForSlot(firstQuestionPoint.id, firstQuestionPoint.label);
      if (firstQuestionRecord) wizardState.followUpQuestionHistory = [firstQuestionRecord];
    }

    await ensureCreationSession();
    await syncPersistence();

    if (wizardState.followUpQuestionHistory.length === 0 || canGenerateKgiNow()) {
      wizardState.followUpStopReason = "ambiguity_resolved";
      buildKgiSourceData();
      await syncPersistence();
      proposalSection.classList.remove("hidden");
      questionSection.classList.add("hidden");
      renderProposal();
      setStep(3);
      setStatus("KGI元データを作成しました。内容確認後にKGI本体を生成します。", false);
      return;
    }

    questionSection.classList.remove("hidden");
    proposalSection.classList.add("hidden");
    renderQuestion();
    setStep(2);
    await syncPersistence();
    setStatus("この目標を達成したと言える条件をそろえるため、必要な質問だけ続けます。", false);
  } catch (error) {
    wizardState.lastError = "AIとの通信に失敗しましたが、回答内容は保存されています。";
    wizardState.pendingAction = async () => {
      wizardState.lastError = null;
      renderRecoveryCard();
      startDeepDiveButton.click();
    };
    renderRecoveryCard();
    setStatus(`開始処理に失敗しました: ${error?.message || "unknown"}`, true);
  } finally {
    startDeepDiveButton.disabled = false;
    startDeepDiveButton.textContent = "次へ進む";
  }
});

prevQuestionButton.addEventListener("click", () => {
  if (wizardState.currentQuestionIndex > 0) {
    wizardState.currentQuestionIndex -= 1;
    renderQuestion();
  }
});

otherAnswerInput.addEventListener("input", () => {
  const questionId = wizardState.followUpQuestionHistory[wizardState.currentQuestionIndex]?.id;
  const question = getQuestionRecord(questionId);
  if (!question) return;
  const answer = wizardState.followUpAnswers[question.id];
  if (answer?.selectedOptionId === "other") {
    answer.otherText = (otherAnswerInput.value || "").trim();
    answer.followUpOtherText = answer.otherText;
    persistDraftToLocal();
  }
});

nextQuestionButton.addEventListener("click", async () => {
  if (isAdvancingQuestion) return;
  const questionId = wizardState.followUpQuestionHistory[wizardState.currentQuestionIndex]?.id;
  const question = getQuestionRecord(questionId);
  if (!question) {
    alert("質問の読み込みに失敗しました。");
    setStatus("通信に失敗しました。再度お試しください。", true);
    return;
  }
  const answer = wizardState.followUpAnswers[question?.id || ""];
  if (!answer?.selectedOptionId) {
    alert("選択肢を1つ選んでください。");
    return;
  }
  if (answer.selectedOptionId === "other" && question?.allowOtherText && !answer.otherText) {
    alert("「その他」の内容を短く入力してください。");
    otherAnswerInput.focus();
    return;
  }
  isAdvancingQuestion = true;
  nextQuestionButton.disabled = true;
  nextQuestionButton.textContent = "処理中...";

  try {
    wizardState.lastError = null;
    const existingHistoryIndex = wizardState.followUpAnswerHistory.findIndex((item) => item.questionId === question.id);
    const historyEntry = {
      questionId: question.id,
      followUpGeneratedBy: wizardState.followUpQuestionHistory[wizardState.currentQuestionIndex]?.followUpGeneratedBy || "fallback_logic",
      followUpSlot: question.id,
      followUpQuestionText: question.text,
      followUpHelpText: question.helpText || "",
      followUpOptionsSnapshot: question.options,
      followUpSelectedOptionId: answer.selectedOptionId,
      followUpSelectedOptionLabel: answer.selectedOptionLabel,
      followUpOtherText: answer.otherText || "",
      questionText: question.text,
      selectedOptionId: answer.selectedOptionId,
      selectedOptionLabel: answer.selectedOptionLabel,
      otherText: answer.otherText || ""
    };
    if (existingHistoryIndex >= 0) wizardState.followUpAnswerHistory[existingHistoryIndex] = historyEntry;
    else wizardState.followUpAnswerHistory.push(historyEntry);
    await syncPersistence();

    const isLast = wizardState.currentQuestionIndex === wizardState.followUpQuestionHistory.length - 1;
    if (!isLast) {
      wizardState.currentQuestionIndex += 1;
      renderQuestion();
      return;
    }

    recomputeRequiredSlotState();
    const reachedMax = wizardState.followUpAnswerHistory.length >= wizardState.maxFollowUpQuestions;
    const nextPointCandidate = chooseNextQuestion();
    const shouldStop = canGenerateKgiNow() || reachedMax || nextPointCandidate == null;
    if (!shouldStop) {
      setStatus("質問を作成中です... AIに質問文を作ってもらっています（少し時間がかかる場合があります）。", false);
      const nextPoint = nextPointCandidate;
      const nextQuestionRecord = await createQuestionRecordForSlot(nextPoint.id, nextPoint.label);
      if (!nextQuestionRecord) {
        wizardState.followUpStopReason = "question_generation_failed";
        wizardState.lastError = "AIとの通信に失敗しましたが、回答内容は保存されています。";
        wizardState.pendingAction = async () => {
          wizardState.lastError = null;
          renderRecoveryCard();
          nextQuestionButton.click();
        };
        await syncPersistence();
        setStep(2);
        renderRecoveryCard();
        setStatus("KGI元データの生成に失敗しましたが、回答内容は保存されています。もう一度生成してください。", true);
        return;
      }
      wizardState.followUpQuestionHistory.push(nextQuestionRecord);
      wizardState.currentQuestionIndex += 1;
      await syncPersistence();
      if (nextQuestionRecord.followUpGeneratedBy === "fallback_logic") {
        setStatus("通常質問へ切り替えました。続けて回答してください。", false);
      } else {
        setStatus("次の質問を表示しました。", false);
      }
      renderQuestion();
      return;
    }

    wizardState.followUpStopReason = reachedMax ? "max_questions_reached" : "ambiguity_resolved";
    buildKgiSourceData();
    await syncPersistence();
    questionSection.classList.add("hidden");
    proposalSection.classList.remove("hidden");
    renderProposal();
    setStep(3);
    const hasMissing = wizardState.missingRequiredSlots.length > 0;
    setStatus(hasMissing ? "あと1つ決めると保存できます。追加質問で成功ラインを具体化しましょう。" : "KGI元データを作成しました。まず内容確認をお願いします。", false);
  } catch (error) {
    logFollowUpError("次へ処理中に予期しないエラー", { error: error?.message || String(error) });
    wizardState.lastError = "AIとの通信に失敗しましたが、回答内容は保存されています。";
    wizardState.pendingAction = async () => {
      wizardState.lastError = null;
      renderRecoveryCard();
      nextQuestionButton.click();
    };
    await syncPersistence();
    renderRecoveryCard();
    setStatus("KGI元データの生成に失敗しましたが、回答内容は保存されています。", true);
  } finally {
    isAdvancingQuestion = false;
    nextQuestionButton.disabled = false;
    nextQuestionButton.textContent = wizardState.currentQuestionIndex === wizardState.followUpQuestionHistory.length - 1 ? "次へ" : "次の質問へ";
  }
});

sourceDataApproveButton?.addEventListener("click", async () => {
  if (!hasRenderableSourceData()) {
    setStatus("KGI元データがまだ作成されていません。", true);
    return;
  }
  sourceDataApproveButton.disabled = true;
  sourceDataApproveButton.textContent = "処理中...";
  try {
    if (!wizardState.kgiStatement || !wizardState.kgiSuccessCriteria.length) buildKgiStatementAndCriteria();
    const gate = applyQualityGate();
    if (!gate.pass) {
      wizardState.sourceDataConfirmed = false;
      console.warn("[KGI_QUALITY_GATE] step3 blocked", gate.issues);
      setStatus(`あと1つ決めると保存できます。成功ラインを数字で決めましょう。(${gate.issues.join(" / ")})`, false);
      renderProposal();
      await syncPersistence();
      return;
    }
    wizardState.sourceDataConfirmed = true;
    buildGapAnalysis();
    buildKpiDrafts();
    await syncPersistence();
    renderProposal();
    setStatus("KGI元データを反映して、KGI本体→達成条件→差分整理→KPI下書きを順番に生成しました。", false);
  } finally {
    sourceDataApproveButton.disabled = !applyQualityGate().pass;
    sourceDataApproveButton.textContent = "だいたい合っている";
  }
});

sourceDataBackButton?.addEventListener("click", () => {
  wizardState.sourceDataConfirmed = false;
  wizardState.sourceDataEdited = true;
  proposalSection.classList.add("hidden");
  questionSection.classList.remove("hidden");
  wizardState.currentQuestionIndex = Math.max(0, wizardState.followUpQuestionHistory.length - 1);
  renderQuestion();
  setStep(2);
  persistDraftToLocal();
  setStatus("追加質問に戻りました。補足を回答してから再作成できます。", false);
});

const persistKgi = async () => {
  if (!db) {
    alert("Firebase接続を初期化中です。数秒後に再試行してください。");
    return;
  }

  const name = (nameInput.value || "").trim();
  const goalText = (goalTextInput.value || "").trim();
  const deadline = (deadlineInput.value || "").trim();
  const level = (levelInput.value || "normal").trim();

  if (!name || !goalText || !deadline) {
    alert("KGI名・ゴール説明・期限を入力してください。");
    return;
  }
  if (!wizardState.sourceDataConfirmed) {
    alert("先にKGI元データを確認して「だいたい合っている」を押してください。");
    return;
  }
  const gate = applyQualityGate();
  if (!gate.pass) {
    console.warn("[KGI_SAVE_BLOCKED] quality gate", gate.issues);
    setStatus(`あと1つ決めると保存できます。次の点を埋めてください: ${gate.issues.join(" / ")}`, true);
    saveButton.disabled = true;
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "処理中...";
  setStep(4);
  console.info("[KGI_SAVE] start", { sessionId: wizardState.sessionId, genreKey: wizardState.genreKey });
  setStatus("保存中です...");

  try {
    const docRef = await addDoc(collection(db, "kgis"), {
      name,
      goalText,
      startDate: new Date().toISOString().slice(0, 10),
      deadline,
      explanationLevel: level,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      creationFlow: "kgi-wizard-v5-essence-first",
      creationSessionId: wizardState.sessionId,
      sourceMeta: {
        upperGoal: wizardState.upperGoal,
        kgiDeadline: wizardState.kgiDeadline,
        rawSuccessStateInput: wizardState.rawSuccessStateInput,
        clarifiedSuccessState: wizardState.clarifiedSuccessState,
        aiKgiSourceData: wizardState.aiKgiSourceData,
        kgiStatement: wizardState.kgiStatement,
        kgiSuccessCriteria: wizardState.kgiSuccessCriteria,
        ambiguityPoints: wizardState.ambiguityPoints,
        ambiguityPointsInitial: wizardState.ambiguityPointsInitial.map((point) => point.label),
        ambiguityPointsResolved: wizardState.ambiguityPointsResolved.map((point) => point.label),
        ambiguityPointsRemaining: wizardState.ambiguityPointsRemaining.map((point) => point.label),
        followUpQuestions: wizardState.followUpQuestionHistory,
        followUpQuestionHistory: wizardState.followUpQuestionHistory,
        followUpAnswers: wizardState.followUpAnswers,
        followUpAnswerHistory: wizardState.followUpAnswerHistory,
        followUpStopReason: wizardState.followUpStopReason,
        nextKgiSuggestion: wizardState.nextKgiSuggestion,
        genreClassification: wizardState.genreClassification,
        gapAnalysis: wizardState.gapAnalysis,
        kpiDrafts: wizardState.kpiDrafts,
        interviewNotes: wizardState.interviewNotes,
        sourceDataConfirmed: wizardState.sourceDataConfirmed,
        sourceDataEdited: wizardState.sourceDataEdited,
        currentKgiScope: wizardState.currentKgiScope,
        requiredSlotsByGenre: wizardState.requiredSlotsByGenre,
        filledSlots: wizardState.filledSlots,
        missingRequiredSlots: wizardState.missingRequiredSlots,
        minimumQuestionCountForGenre: wizardState.minimumQuestionCountForGenre,
        followUpCount: wizardState.followUpCount,
        sourceDataReady: wizardState.sourceDataReady,
        missingReasonLoopCounts: wizardState.missingReasonLoopCounts,
        missingReasonLastIssue: wizardState.missingReasonLastIssue,
        missingReasonLastResolvedSlot: wizardState.missingReasonLastResolvedSlot
      }
    });

    await syncPersistence();
    clearLocalDraft();
    console.info("[KGI_SAVE] success", { id: docRef.id });
    setStatus("保存が完了しました。詳細画面へ移動します。", false);
    location.href = `./detail.html?id=${docRef.id}`;
  } catch (error) {
    console.error(error);
    console.error("[KGI_SAVE] failed", { error: error?.message || String(error) });
    setStatus("保存に失敗しました。Firebase設定とルールを確認してください。", true);
    saveButton.disabled = false;
    saveButton.textContent = "この内容で保存";
  }
};

saveButton.addEventListener("click", persistKgi);

const applySpecificityCandidate = () => {
  const candidate = {
    name: (specificityCandidateName?.textContent || "").trim(),
    goalText: (specificityCandidateGoal?.textContent || "").trim(),
    deadline: (specificityCandidateDeadline?.textContent || "").trim()
  };
  if (!candidate.goalText) {
    return {
      applied: false,
      reason: "補正候補が見つからないため反映できません。"
    };
  }
  if (candidate.name) nameInput.value = candidate.name;
  goalTextInput.value = candidate.goalText;
  if (candidate.deadline && /^\d{4}-\d{2}-\d{2}$/.test(candidate.deadline)) deadlineInput.value = candidate.deadline;
  return { applied: true };
};

saveWithSpecificityButton?.addEventListener("click", async () => {
  console.info("[KGI_SPECIFICITY] button clicked");
  const gate = applyQualityGate();
  saveWithSpecificityButton.disabled = true;
  saveWithSpecificityButton.textContent = "処理中...";
  try {
    setStatus("処理中...補正を反映しています。", false);
    const result = applySpecificityCandidate();
    if (!result.applied) {
      console.warn("[KGI_SPECIFICITY] apply failed", { reason: result.reason });
      setStatus(result.reason, true);
      return;
    }
    console.info("[KGI_SPECIFICITY] apply success");
    setStatus("補正を反映しました。", false);
    if (!gate.pass) {
      setStatus("補正を反映しました。内容を確認して不足項目を埋めてください。", false);
      return;
    }
    setStatus("補正を反映しました。保存します。", false);
    await persistKgi();
  } catch (error) {
    console.error("[KGI_SPECIFICITY] failed", { error: error?.message || String(error) });
    setStatus("保存に失敗しました。", true);
  } finally {
    saveWithSpecificityButton.disabled = false;
    updateSpecificityButtonState();
  }
});

editSpecificityButton?.addEventListener("click", () => {
  applySpecificityCandidate();
  specificityWarningBox?.classList.add("hidden");
  setStatus("補正案を下の編集欄へ反映しました。内容を確認して保存してください。", false);
});

saveButton.disabled = true;
setStatus("Firebase接続を初期化しています...");

const restoreDraftFromLocal = () => {
  try {
    const latestKey = localStorage.getItem(LOCAL_DRAFT_LATEST_KEY);
    if (!latestKey) return;
    const raw = localStorage.getItem(latestKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const draft = parsed?.payload;
    if (!draft) return;
    const updatedAt = Date.parse(parsed?.updatedAt || "");
    const expired = Number.isFinite(updatedAt) ? (Date.now() - updatedAt > DRAFT_RESTORE_TTL_MS) : true;
    const currentFingerprint = getSessionFingerprint(
      (roughDeadlineInput?.value || "").trim(),
      (roughGoalInput?.value || "").trim()
    );
    const draftFingerprint = parsed?.sessionFingerprint || getSessionFingerprint(parsed?.kgiDeadline, parsed?.rawSuccessStateInput);
    const hasMatchingInput = Boolean(currentFingerprint && draftFingerprint && currentFingerprint === draftFingerprint && !currentFingerprint.endsWith("::"));
    if (expired || !hasMatchingInput) {
      logSessionInfo("draft ignored due to input mismatch", {
        latestKey,
        expired,
        currentFingerprint,
        draftFingerprint
      });
      return;
    }
    Object.assign(wizardState, draft);
    logSessionInfo("restoring draft", { latestKey, sessionId: wizardState.sessionId });
    if (wizardState.kgiDeadline) roughDeadlineInput.value = wizardState.kgiDeadline;
    if (wizardState.rawSuccessStateInput) roughGoalInput.value = wizardState.rawSuccessStateInput;
    if (wizardState.step >= 2 && wizardState.followUpQuestionHistory.length > 0) {
      questionSection.classList.remove("hidden");
      renderQuestion();
      setStep(2);
    }
    if (wizardState.sourceDataReady) {
      proposalSection.classList.remove("hidden");
      questionSection.classList.add("hidden");
      renderProposal();
      setStep(wizardState.sourceDataConfirmed ? 3 : 2);
    }
    setStatus("前回の下書きを復元しました。", false);
  } catch (error) {
    console.warn("下書き復元に失敗", error);
  }
};

(async () => {
  try {
    restoreDraftFromLocal();
    db = await getDb();
    const gate = applyQualityGate();
    saveButton.disabled = !wizardState.sourceDataConfirmed || !gate.pass;
    updateSpecificityButtonState();
    setStatus("Firebase接続が完了しました。", false);
  } catch (error) {
    console.error(error);
    setStatus("Firebase接続に失敗しました。設定を確認してください。", true);
  }
})();
