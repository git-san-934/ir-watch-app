# IR Watch

東証(TSE)の TDnet 適時開示情報から、登録した銘柄の新着開示をまとめて確認できる Web アプリです。会社ごとの IR ページを個別に見に行く代わりに、TDnet のデータをもとに一覧表示します。

## 機能 (MVP)

- 証券コード(4桁)と会社名で銘柄を登録・削除
- 登録銘柄の直近の適時開示一覧をアプリ内に表示(前回確認以降の新着は "NEW" 表示)
- ログイン不要。初回アクセス時に匿名 ID を Cookie に保存し、他人からは自分の登録銘柄・開示情報が見えないようにデータを分離

通知連携(メール/LINE など)は未実装です。今後の拡張ポイントとして想定しています。

## 技術構成

- Next.js (App Router) + TypeScript
- Tailwind CSS
- better-sqlite3 によるローカル SQLite 永続化(監視銘柄・最終確認時刻のみ。開示情報自体は保存せず都度取得)
- TDnet データ取得元: [Yanoshin TDnet API](https://webapi.yanoshin.jp/) (TDnet 本体には公開 API がないため、コミュニティ提供の JSON ミラーを利用)

> **開発環境に関する注意**: この Claude Code のサンドボックス環境は許可リスト外のホストへの外部通信がブロックされているため、TDnet ミラー API への実際の疎通確認はこの環境からは行えていません。`src/lib/tdnet.ts` はレスポンス形式についていくつかのバリエーションを許容するよう防御的に実装していますが、本番環境で実際のレスポンスに対して動作確認することを推奨します。

## セットアップ

```bash
npm install
cp .env.example .env
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いてください。

## テスト・Lint

```bash
npm test        # vitest によるユニットテスト(TDnet パーサー、監視銘柄ストレージ)
npm run lint
npx tsc --noEmit
npm run build
```

## データの保存場所

`DATABASE_PATH` 環境変数(未設定時は `./data/app.db`)に SQLite ファイルを作成します。デプロイ先によっては永続ボリュームの設定が必要です。
