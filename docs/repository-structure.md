# リポジトリ構造定義書 (repository-structure.md)

## フォルダ・ファイル構成

```
ir-watch-app/
├── docs/                          # 永続的ドキュメント(本ファイル群)
│   ├── product-requirements.md
│   ├── functional-design.md
│   ├── architecture.md
│   ├── repository-structure.md
│   ├── development-guidelines.md
│   └── glossary.md
├── .steering/                     # 作業単位のドキュメント(作業ごとに新規ディレクトリ)
│   └── [YYYYMMDD]-[開発タイトル]/
│       ├── requirements.md
│       ├── design.md
│       └── tasklist.md
├── .github/workflows/deploy.yml   # CI/CD: test → lint → データ取得 → build → GitHub Pages デプロイ
├── scripts/
│   └── fetch-tdnet.ts             # TDnet 開示・自社株買いサマリの取得スクリプト(GitHub Actions 専用)
├── src/
│   ├── app/                       # Next.js App Router(layout.tsx, page.tsx, globals.css)
│   ├── components/
│   │   └── Dashboard.tsx          # メイン UI(タブ切り替え・監視銘柄・自社株買い・時価総額予測)
│   └── lib/
│       ├── tdnet.ts               # TDnet データの型・取得・フィルタ関数
│       ├── watchlist.ts           # 監視銘柄・開示アーカイブの localStorage 永続化
│       ├── treasury-stock.ts      # 自社株買い PDF のテキスト抽出ロジック
│       ├── market-cap-forecast.ts # 時価総額予測の型・計算・localStorage 永続化(新規)
│       └── __tests__/             # 上記各モジュールのユニットテスト
├── public/                        # ビルド成果物として同梱される静的ファイル(スナップショット JSON 等)
├── AGENTS.md                      # Next.js が自動生成・再作成するエージェント向け注意書き
└── CLAUDE.md                      # プロジェクトメモリ(@AGENTS.md の import + 本リポジトリの開発プロセス定義)
```

## ディレクトリの役割

* `docs/` : アプリ全体の恒久的な設計方針。大きな設計変更がない限り更新しない
* `.steering/` : 個別の開発作業(機能追加・修正)ごとの要求・設計・タスクを記録する使い捨てに近いディレクトリ。作業完了後も履歴として残す
* `src/lib/` : UI に依存しない純粋なロジック・データアクセス層。テストしやすいよう React コンポーネントから分離する
* `src/components/` : 画面表示とユーザー操作のハンドリング。ロジックは可能な限り `src/lib/` に委譲する
* `scripts/` : GitHub Actions 上でのみ実行される Node スクリプト(ブラウザでは実行されない)

## ファイル配置ルール

* 新しいドメインロジックは `src/lib/<domain>.ts` に置き、対応するテストを `src/lib/__tests__/<domain>.test.ts` に置く
* localStorage を扱うモジュールは `watchlist.ts` と同じ `StorageLike` 注入パターンを踏襲し、テストではメモリ実装を注入する
* 新しい永続的ドキュメントを追加する場合は `docs/` に、特定の作業の一時的な資料は `.steering/[YYYYMMDD]-[開発タイトル]/` に置く
