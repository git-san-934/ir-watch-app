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
- TDnet データ取得元: [Yanoshin TDnet API](https://webapi.yanoshin.jp/) (TDnet 本体には公開 API がないため、コミュニティ提供の JSON ミラーを利用)。ブラウザから直接この API を呼び出すため、CORS が許可されている前提です。

> **開発環境に関する注意**: この Claude Code のサンドボックス環境は許可リスト外のホストへの外部通信がブロックされているため、TDnet ミラー API への実際の疎通確認(レスポンス形式・CORS 許可の有無)はこの環境からは行えていません。`src/lib/tdnet.ts` はレスポンス形式についていくつかのバリエーションを許容するよう防御的に実装していますが、デプロイ後に実際のブラウザで動作確認することを推奨します。CORS が許可されていない場合は、別の取得方法(別ミラー・サーバーレス関数経由など)への変更が必要になります。

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
npm run build    # ./out に静的ファイルを生成(ローカルプレビュー用。ルートパス basePath なし)
npm run start    # ./out を http-server でプレビュー
```

## デプロイ

`main` ブランチ以外のデフォルト開発ブランチへの push をトリガーに `.github/workflows/deploy.yml` が実行され、`GITHUB_PAGES=true npm run build` でビルドした `./out`(basePath: `/ir-watch-app`)を GitHub Pages に公開します。

リポジトリの Settings → Pages → Source を **GitHub Actions** に設定してください(初回のみ手動設定が必要です)。
