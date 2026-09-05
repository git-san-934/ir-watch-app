# 技術仕様書 (architecture.md)

## テクノロジースタック

* Next.js 16 (App Router)、`output: "export"` による静的書き出し(サーバーサイド機能は使用しない)
* TypeScript / React 19
* Tailwind CSS 4
* Vitest によるユニットテスト
* ESLint (eslint-config-next)
* データ永続化: ブラウザの `localStorage`(サーバー・DB は持たない)
* ホスティング: GitHub Pages(`.github/workflows/deploy.yml` による自動デプロイ)

## 開発ツールと手法

* `npm run dev` でローカル開発サーバーを起動
* `npm test` (vitest run) でユニットテストを実行
* `npm run lint` / `npx tsc --noEmit` で静的検証
* `npm run build` で `./out` に静的サイトを生成
* GitHub Actions (`deploy.yml`) が push・スケジュール実行のたびに `npm test && npm run lint` を通してから `npx tsx scripts/fetch-tdnet.ts` → `npm run build` → GitHub Pages へデプロイ

## 技術的制約と要件

* GitHub Pages は静的ファイルしか配信できないため、サーバーサイド処理(API Route、DB アクセス等)は使用できない
* TDnet 本体・ミラー API は CORS 非対応のため、ブラウザから直接 fetch できない。外部データが必要な場合は GitHub Actions 上のスクリプト(`scripts/`)で取得し `public/*.json` に書き出す方式に統一する
* 時価総額予測機能は、信頼できる無料の時価総額データ API がこの開発環境から検証できなかったため、外部データ取得を行わずクライアント側の入力・計算のみで完結させる(`docs/product-requirements.md` の「今回のスコープ外・既知の制約」参照)。将来、時価総額データの自動取得が可能になった場合は、`scripts/fetch-tdnet.ts` と同様の取得スクリプトを追加し、この制約を緩和できるよう `src/lib/market-cap-forecast.ts` の計算ロジックと入力値の型を分離しておく
* すべてのユーザーデータ(監視銘柄・開示アーカイブ・時価総額予測の入力値)は `localStorage` にのみ保存し、サーバーに送信しない

## パフォーマンス要件

* 予測計算はクライアント側の単純な四則演算のみであり、体感遅延なく(入力のたびに同期的に)再計算されること
* 既存のビルド時間・バンドルサイズに大きな影響を与えないこと(新規の重い依存ライブラリを追加しない)
