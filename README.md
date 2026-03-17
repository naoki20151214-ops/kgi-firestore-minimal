# kgi-firestore-minimal

初心者向けの最小構成で、FirestoreにKGI/KPI/Taskを保存するサンプルです。

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
