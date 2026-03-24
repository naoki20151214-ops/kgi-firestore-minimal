# kgi-firestore-minimal

初心者向けの最小構成で、FirestoreにKGI/KPI/Taskを保存するサンプルです。

## レイアウト方針

- mobile-first を基準にし、スマホでの見やすさを優先する
- 基本は1カラムで、情報は上から順番に読める流れを維持する
- 主ボタンを先頭で目立たせ、補助操作はその下に置く
- PCでは情報の順番は変えず、最大幅・余白・中央寄せだけを調整する
- 当面はPC専用の別レイアウトを作らず、修正コストを増やしすぎない

## 画面構成

- `index.html`: KGIを1件追加
- `list.html`: KGIの一覧表示（名前をクリックすると詳細へ）
- `detail.html`: KGI詳細表示 / KPI追加 / Task追加 / Task達成入力

## Firestoreの構造

```
kgis (collection)
  └─ {kgiId} (document)
      ├─ name: string
      ├─ goalText: string
      ├─ deadline: string (YYYY-MM-DD)
      ├─ createdAt: timestamp
      ├─ updatedAt: timestamp
      └─ kpis (subcollection)
          └─ {kpiId} (document)
              ├─ name: string
              ├─ target: number
              ├─ currentValue: number   // Taskから自動集計して更新
              ├─ progress: number       // currentValue / target から算出
              ├─ createdAt: timestamp
              ├─ updatedAt: timestamp
              └─ tasks (subcollection)
                  └─ {taskId} (document)
                      ├─ title: string
                      ├─ kpiId: string (画面上の関連)
                      ├─ type: "one_time" | "repeatable"
                      ├─ progressValue: number
                      ├─ isCompleted?: boolean      // one_timeのみ
                      ├─ completedCount?: number    // repeatableのみ
                      └─ updatedAt: timestamp
```

### TaskタイプとKPI進捗計算

- `one_time`
  - `isCompleted` で完了管理
  - KPIへの加算値: `isCompleted ? progressValue : 0`
- `repeatable`
  - `completedCount` で回数管理
  - KPIへの加算値: `completedCount * progressValue`
- KPIの `currentValue` はTask一覧から再計算し、手入力値よりTask集計を優先

## 使い方

1. `index.html` でKGIを保存
2. `list.html` で保存したKGIを確認
3. 一覧のKGI名をクリックして `detail.html?id=...` に移動
4. `detail.html` でKPIを追加
5. 同じ画面でTaskを追加し、達成値（完了 or 回数）を更新

## ファイル対応

- `app.js`: KGI作成（`kgis` に保存）
- `list.js`: KGI一覧取得、詳細ページへのリンク作成
- `detail.js`: KGI詳細取得、KPIとTaskの追加、TaskからKPI進捗の自動集計
- `firebase-config.js`: Firebase初期化

---

## 画面情報設計の再設計案（KGI / ロードマップ / 継続タスク分離）

要件として「ロードマップ系（phase配下）」と「継続タスク系（daily/weekly/ad_hoc）」を分離する場合、以下の構成が無理なく拡張しやすい。

### 1) ページ一覧（推奨）

- `kgi-list`（既存: `list.html`）
  - KGI一覧ページ
- `kgi-detail`（既存: `detail.html` を役割縮小）
  - KGIの俯瞰と導線だけを置くハブページ
- `phase-detail`（既存: `phase.html` を活用/再定義）
  - フェーズ単位でKPI一覧を管理するページ
- `kpi-detail`（新設推奨）
  - タスク実行・完了・振り返りの中心ページ
- `routine-tasks`（新設推奨）
  - 継続タスク（daily/weekly/ad_hoc）専用ページ
- `overall-map`（既存: `mindmap.html` を再定義）
  - 最新データから自動生成する全体マップページ

### 2) 各ページの役割と配置

#### kgi-detail（俯瞰専用）

置くもの:
- KGI名
- ゴール説明
- 開始日
- 目標期限日
- ロードマップ概要（フェーズ一覧の要約）
- 「フェーズへ進む」導線
- 「継続タスクへ進む」導線
- 「全体マップを見る」導線

置かないもの:
- KPI/タスクの直接編集UI
- 実行ログや細かい完了操作

狙い:
- 「KGI詳細で全部やる」状態を避け、ユーザーの認知負荷を下げる。

#### phase-detail（段階管理）

置くもの:
- フェーズ名
- フェーズ目的
- フェーズ期限
- このフェーズ配下のKPI一覧
- KPI作成導線

狙い:
- 「どの段階で何を達成するか」の整理に集中させる。

#### kpi-detail（実行の中心）

置くもの:
- KPI名
- KPI説明
- 進捗（current/target/progress）
- 紐づくタスク一覧
- タスク追加
- タスク完了入力
- 振り返り（メモ）

狙い:
- 実行オペレーションを1箇所に集約し、日次利用を安定化させる。

#### routine-tasks（継続タスク専用）

置くもの:
- daily / weekly / ad_hoc の継続タスク一覧
- 実施チェック
- 最終実施日
- 実施回数

狙い:
- フェーズに乗らないがKGIに効く行動を独立管理し、見落としを減らす。

#### overall-map（マインドマップ）

置くもの:
- `KGI -> ロードマップ -> フェーズ -> KPI -> タスク`
- `KGI -> 継続タスク -> daily/weekly/ad_hoc`

方針:
- KGI詳細に常時埋め込まない（別ページ）
- 保存しない（都度、最新Firestoreから生成）
- 重い処理やrealtime listenerを常駐させない（オンデマンド取得）

### 3) 継続タスクをどこで管理するのが最適か

結論:
- 編集・実施は `routine-tasks` に一本化
- `kgi-detail` には「サマリー＋遷移ボタン」だけ置く

理由:
- 実行頻度が高い情報（daily/weekly）を、ロードマップ系と同じ画面に混在させると操作目的がぶれるため。
- 継続タスクはフェーズ非依存のため、データモデル上もUI上も分離した方が整合しやすい。

### 4) パンくず（推奨ルール）

- `KGI一覧 > KGI詳細`
- `KGI一覧 > KGI詳細 > フェーズ詳細`
- `KGI一覧 > KGI詳細 > フェーズ詳細 > KPI詳細`
- `KGI一覧 > KGI詳細 > 継続タスク`
- `KGI一覧 > KGI詳細 > 全体マップ`

実装ポイント:
- 各ページで表示名（KGI名、フェーズ名、KPI名）を動的取得
- URLクエリは最低限（`kgiId`, `phaseId`, `kpiId`）

### 5) 安定性を崩さない実装順（推奨）

#### Phase 0: 既存互換を維持
- まず既存 `detail.html` を壊さない。
- 裏側データ構造変更より先に、画面導線の分離から着手する。

#### Phase 1: 画面の責務分離（低リスク）
- `kgi-detail` を俯瞰ハブ化（既存機能の一部を残しつつ縮小）
- `phase-detail` へKPI一覧/作成を移管

#### Phase 2: 実行系の分離（中リスク）
- `kpi-detail` 新設（タスク追加/完了/振り返りを移管）
- 既存 `detail` 内タスク操作を段階的に無効化

#### Phase 3: 継続タスク導入（中リスク）
- `routine-tasks` 新設
- カテゴリ（daily/weekly/ad_hoc）と実施ログを管理

#### Phase 4: 全体マップ独立（低〜中リスク）
- `overall-map`（`mindmap.html`）でオンデマンド生成
- 初回は手動更新ボタン方式にし、常時監視を避ける

#### Phase 5: 旧導線の整理（最終）
- 利用ログ/運用確認後に旧UIを削除
- 互換期間中は旧URLから新URLへ誘導メッセージを表示

### 6) 戻す機能 / 新設ページの優先順位

優先順位（高 -> 低）:
1. `kgi-detail` のハブ化（既存利用者が迷わない導線確保）
2. `phase-detail` の責務固定（フェーズ配下にKPIを集約）
3. `kpi-detail` 新設（実行中心を分離）
4. `routine-tasks` 新設（継続タスク分離）
5. `overall-map` 最適化（最後に俯瞰表示を強化）

「戻しやすさ」の観点:
- 各Phaseで feature flag（またはリンク切替）を使い、旧画面へ戻せる状態を一定期間維持する。
- データ移行が必要な変更（スキーマ変更）は、UI分離が安定してから実施する。
