# 開発ガイドライン (development-guidelines.md)

## 命名規則

* TypeScript の変数・関数はキャメルケース、型・インターフェースは PascalCase
* 金額は単位をサフィックスで明示する: 円単位は `*Yen`、億円単位は `*Oku`
* 変化率(%)を表す値は `*Percent` を明示的に付ける(例: `volumeChangeRatePercent`)。0〜1 の比率(例: 増収率)は `*Rate` とし、`*Percent` と混在させない
* localStorage のキーは `ir-watch:<用途>` プレフィックスを付ける
* 日本語 UI 文言と英語識別子の対応は `docs/glossary.md` に追記する

## スタイリング規約

* Tailwind CSS のユーティリティクラスを直接 JSX に記述する(独自の CSS ファイルを増やさない)
* ライト/ダークモード両対応のクラス(`dark:` プレフィックス)を既存コンポーネントと同じトーン(zinc 系のニュートラルカラー、強調は既存の配色パターンに合わせる)で追加する

## テスト規約

* `src/lib/` のロジックは Vitest でユニットテストする。localStorage を使うモジュールはメモリ実装の `StorageLike` を注入してテストし、実際の `window.localStorage` に依存しない
* 計算ロジック(数式)は境界値(0%、負の変化率、`remainingQuarters = 1`など)を含めてテストする
* UI コンポーネント(`Dashboard.tsx`)自体の自動テストは現状導入していない。変更時は `npm run dev` で実機確認する

## Git 規約

* コミットメッセージは変更の目的(why)を簡潔に記述する
* 1つの作業単位(`.steering/[YYYYMMDD]-[開発タイトル]/`)に対応する変更は、まとまった単位でコミットする
* 既存のブランチ運用(`.github/workflows/deploy.yml` に設定されたデプロイ対象ブランチ)を変更する場合は、その意図をコミットメッセージまたは PR 説明に明記する

## 品質チェック(実装完了時に必ず実行)

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

すべて成功することを確認してからコミット・プッシュする。
