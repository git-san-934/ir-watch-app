# IR Watch

東証(TSE)の TDnet 適時開示情報から、登録した銘柄の新着開示をまとめて確認できる Web アプリです。会社ごとの IR ページを個別に見に行く代わりに、TDnet のデータをもとに一覧表示します。

GitHub Pages でホストする静的サイトです([https://git-san-934.github.io/ir-watch-app/](https://git-san-934.github.io/ir-watch-app/))。サーバーは持たず、すべてブラウザ内で動作します。

## 機能 (MVP)

- 証券コード(4桁、英字を含むコードにも対応)と会社名で銘柄を登録・削除
- 登録銘柄の適時開示一覧をアプリ内に表示。一度取り込まれた開示情報は削除するまで残り続けます(下記「開示情報の保持ポリシー」参照)。新しく取り込まれたものには "NEW" 表示
- 「監視銘柄」タブとは別に「自社株買い(全銘柄)」タブがあり、登録銘柄に関係なく**全上場企業**の自己株式取得(自社株買い)状況を**銘柄ごとに集計した一覧表**で確認できます(証券コード・銘柄名・総額(上限)・累計取得額・先月取得額)。詳しくは下記「自社株買い集計の仕組み」を参照してください
- 監視銘柄の各開示情報は × ボタンで個別に非表示(削除)にできます
- ログイン不要。監視銘柄・開示情報の記録・非表示リストはすべてブラウザの localStorage にのみ保存され、この端末以外(他人・他のデバイス)からは見えません

通知連携(メール/LINE など)は未実装です。今後の拡張ポイントとして想定しています。

### 開示情報の保持ポリシー(監視銘柄タブ)

- ブラウザが一度取り込んだ開示情報は、× で削除するまで**永続的に**残ります(`src/lib/watchlist.ts` の `mergeArchivedDisclosures`)
- 「更新」ボタン・再訪問・タブを開いたまま5分おきの自動チェック(タブに戻ってきた時も即チェック)のたびに、まだ取り込んでいない新着分だけを追加で取り込みます(差分マージ)
- ただし、サーバー側(`scripts/fetch-tdnet.ts`)は直近30日分のTDnetデータしか保持していません。**30日以上サイトを開かないと、その間に出た開示情報は一度も取り込まれずに失われます**(取り込まれた後のものは永続的に残ります)。この期間は `scripts/fetch-tdnet.ts` の `DAYS` 定数で調整できます。

### 自社株買い集計の仕組み

「自社株買い(全銘柄)」タブは、開示の一覧ではなく銘柄ごとの集計表です(件数が多すぎて開示を1件ずつ見るのは非現実的だったため)。総額・累計取得額・先月取得額は TDnet の開示リスト自体には含まれておらず、各社が提出する **PDFの中身**に書かれています。そのため `scripts/fetch-tdnet.ts` が実行のたびに:

1. タイトルに「自己株式」+「取得」「買付」等を含む開示(`isTreasuryStockDisclosure`)を全銘柄分抽出
2. 銘柄ごとに直近の該当開示(最大3件)のPDFをダウンロードし、`pdf-parse` でテキスト抽出
3. 「取得価額の総額」などのラベル付き金額を、出現位置と前後の文脈(「上限」「累計」の有無・距離)で分類して抽出(`src/lib/treasury-stock.ts` の `parseBuybackPdfText`)
4. 結果を `public/treasury-stock-summary.json` に書き出す

> **既知の制約**: PDFの文言は会社ごとに表記ゆれがあり、値が見つからない項目は「—」と表示されます。抽出パターンの調整が必要であれば `parseBuybackPdfText` を編集してください。また1回の実行で処理するPDF件数には上限(`maxTotalPdfFetches`、既定400件)があり、超過分は次回実行時に処理されます。

## 技術構成

- Next.js (App Router) + TypeScript, `output: "export"` による静的書き出し
- Tailwind CSS
- 監視銘柄・開示情報の記録・非表示リストは `localStorage` に保存(サーバー・DBは持たない)
- TDnet データ取得元: [Yanoshin TDnet API](https://webapi.yanoshin.jp/) (TDnet 本体には公開 API がないため、コミュニティ提供の JSON ミラーを利用)

### TDnet データの取得方法(CORS 制約への対応)

このミラー API は CORS ヘッダーを返さないため、ブラウザから直接 `fetch` できません(デプロイ後に実機で確認済み)。そのため以下の方式にしています:

1. `scripts/fetch-tdnet.ts` が GitHub Actions 上(サーバー側、CORS の制約を受けない)で直近30日分の開示情報を取得し、`public/tdnet-disclosures.json` に書き出す
2. `next build` でこのファイルが静的サイトに同梱される
3. ブラウザは同一オリジンの `tdnet-disclosures.json` を読み込み、登録銘柄でフィルタする(`src/lib/tdnet.ts` の `fetchDisclosuresSnapshot`)

そのため開示情報は完全リアルタイムではなく、`.github/workflows/deploy.yml` のスケジュール実行(平日15分おき)時点のスナップショットになります。取得元 API やスケジュール頻度を変更したい場合は `scripts/fetch-tdnet.ts` と `deploy.yml` の `schedule.cron` を編集してください。

## セットアップ

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いてください。

## テスト・Lint・静的書き出し

```bash
npm test        # vitest によるユニットテスト(TDnet パーサー、watchlist の localStorage 保存)
npm run lint
npx tsc --noEmit
npx tsx scripts/fetch-tdnet.ts  # public/tdnet-disclosures.json を生成(ローカルで開示情報を試す場合)
npm run build    # ./out に静的ファイルを生成(ローカルプレビュー用。ルートパス basePath なし)
npm run start    # ./out を http-server でプレビュー
```

## デプロイ

`.github/workflows/deploy.yml` は次のタイミングで実行されます:

- 開発ブランチ(`claude/continue-development-xp5vmg`)への push
- 平日15分おきのスケジュール実行(TDnet スナップショットの更新用)
- Actions タブからの手動実行(workflow_dispatch)

毎回 `scripts/fetch-tdnet.ts` で最新の開示情報を取得し直してから `GITHUB_PAGES=true npm run build` でビルドした `./out`(basePath: `/ir-watch-app`)を GitHub Pages に公開します。TDnet 取得に失敗した場合はその回のデプロイ自体が失敗し、直前の正常なデプロイがそのまま公開され続けます。

リポジトリの Settings → Pages → Source を **GitHub Actions** に設定してください(初回のみ手動設定が必要です)。また非公開(Private)リポジトリでは無料プランで GitHub Pages を有効化できないため、公開(Public)リポジトリにしてください。
