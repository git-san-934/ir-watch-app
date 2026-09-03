# IR Watch

東証(TSE)の TDnet 適時開示情報から、登録した銘柄の新着開示をまとめて確認できる Web アプリです。会社ごとの IR ページを個別に見に行く代わりに、TDnet のデータをもとに一覧表示します。

GitHub Pages でホストする静的サイトです([https://git-san-934.github.io/ir-watch-app/](https://git-san-934.github.io/ir-watch-app/))。サーバーは持たず、すべてブラウザ内で動作します。

## 機能 (MVP)

- 証券コード(4桁)と会社名で銘柄を登録・削除
- 登録銘柄の直近の適時開示一覧をアプリ内に表示(前回確認以降の新着は "NEW" 表示)
- ログイン不要。監視銘柄と最終確認時刻はブラウザの localStorage にのみ保存され、この端末以外(他人・他のデバイス)からは見えません

通知連携(メール/LINE など)は未実装です。今後の拡張ポイントとして想定しています。

## 技術構成

- Next.js (App Router) + TypeScript, `output: "export"` による静的書き出し
- Tailwind CSS
- 監視銘柄・最終確認時刻は `localStorage` に保存(サーバー・DBは持たない)
- TDnet データ取得元: [Yanoshin TDnet API](https://webapi.yanoshin.jp/) (TDnet 本体には公開 API がないため、コミュニティ提供の JSON ミラーを利用)

### TDnet データの取得方法(CORS 制約への対応)

このミラー API は CORS ヘッダーを返さないため、ブラウザから直接 `fetch` できません(デプロイ後に実機で確認済み)。そのため以下の方式にしています:

1. `scripts/fetch-tdnet.ts` が GitHub Actions 上(サーバー側、CORS の制約を受けない)で直近7日分の開示情報を取得し、`public/tdnet-disclosures.json` に書き出す
2. `next build` でこのファイルが静的サイトに同梱される
3. ブラウザは同一オリジンの `tdnet-disclosures.json` を読み込み、登録銘柄でフィルタする(`src/lib/tdnet.ts` の `fetchDisclosuresSnapshot`)

そのため開示情報は完全リアルタイムではなく、`.github/workflows/deploy.yml` のスケジュール実行(平日30分おき)時点のスナップショットになります。取得元 API やスケジュール頻度を変更したい場合は `scripts/fetch-tdnet.ts` と `deploy.yml` の `schedule.cron` を編集してください。

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
- 平日30分おきのスケジュール実行(TDnet スナップショットの更新用)
- Actions タブからの手動実行(workflow_dispatch)

毎回 `scripts/fetch-tdnet.ts` で最新の開示情報を取得し直してから `GITHUB_PAGES=true npm run build` でビルドした `./out`(basePath: `/ir-watch-app`)を GitHub Pages に公開します。TDnet 取得に失敗した場合はその回のデプロイ自体が失敗し、直前の正常なデプロイがそのまま公開され続けます。

リポジトリの Settings → Pages → Source を **GitHub Actions** に設定してください(初回のみ手動設定が必要です)。また非公開(Private)リポジトリでは無料プランで GitHub Pages を有効化できないため、公開(Public)リポジトリにしてください。
