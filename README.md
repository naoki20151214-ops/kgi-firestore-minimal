# kgi-firestore-minimal

初心者向けの最小構成で、FirestoreにKGI/KPIを保存するサンプルです。

## 画面構成

- `index.html`: KGIを1件追加
- `list.html`: KGIの一覧表示（名前をクリックすると詳細へ）
- `detail.html`: KGI詳細表示 / KPI追加 / KPI進捗更新

## Firestoreの構造

```
kgis (collection)
  └─ {kgiId} (document)
      ├─ name: string
      ├─ target: number
      ├─ emoji: string
      ├─ createdAt: timestamp
      └─ kpis (subcollection)
          └─ {kpiId} (document)
              ├─ name: string
              ├─ target: number
              ├─ progress: number
              ├─ createdAt: timestamp
              └─ updatedAt: timestamp
```

## 使い方

1. `index.html` でKGIを保存
2. `list.html` で保存したKGIを確認
3. 一覧のKGI名をクリックして `detail.html?id=...` に移動
4. `detail.html` でKPIを追加
5. 同じ画面でKPIの進捗を更新

## ファイル対応

- `app.js`: KGI作成（`kgis` に保存）
- `list.js`: KGI一覧取得、詳細ページへのリンク作成
- `detail.js`: KGI詳細取得、`kpis`サブコレクションの追加・更新
- `firebase-config.js`: Firebase初期化
