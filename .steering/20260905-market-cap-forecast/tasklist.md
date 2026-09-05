# タスクリスト: 時価総額予測タブの追加

- [x] `docs/` 配下の永続的ドキュメント作成(product-requirements / functional-design / architecture / repository-structure / development-guidelines / glossary)
- [x] `.steering/20260905-market-cap-forecast/` の requirements.md / design.md / tasklist.md 作成
- [x] `src/lib/market-cap-forecast.ts` の実装(型・計算関数・localStorage 永続化)
- [x] `src/lib/__tests__/market-cap-forecast.test.ts` の実装
- [x] `src/components/Dashboard.tsx` に「時価総額予測」タブを追加
- [x] 監視銘柄削除時に対応する予測入力も削除するよう `handleRemoveCompany` を更新
- [x] `README.md` に新機能の説明を追記
- [x] `npm test` / `npm run lint` / `npx tsc --noEmit` / `npm run build` の実行・成功確認
- [x] コミット・プッシュ

## 完了条件

上記すべてのタスクが完了し、品質チェック(テスト・Lint・型チェック・ビルド)がすべて成功していること。
