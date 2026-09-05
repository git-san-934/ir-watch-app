# 設計: 時価総額予測タブの追加

## 実装アプローチ

1. `src/lib/market-cap-forecast.ts` を新規作成する
   * 型: `MarketCapForecastInput`, `MarketCapForecastResult`
   * 純粋関数: `calculateForecast(input: MarketCapForecastInput): MarketCapForecastResult | null`(現在の時価総額が null/未入力なら null を返す)
   * 永続化関数(`watchlist.ts` と同じ `StorageLike` 注入パターン): `getForecastInput(companyId, storage?)`, `setForecastInput(companyId, input, storage?)`, `removeForecastInput(companyId, storage?)`
   * localStorage キー: `ir-watch:market-cap-forecast`(companyId をキーとするオブジェクトを1つの JSON として保存)
2. `src/components/Dashboard.tsx` を変更する
   * `Tab` 型に `"forecast"` を追加し、タブボタンを1つ追加する
   * 新タブのレンダリングでは、`companies` をループし、各社ごとに `market-cap-forecast.ts` の入力値をローカル state で保持・編集し、変更のたびに `setForecastInput` で保存 + `calculateForecast` で再計算する
   * `handleRemoveCompany` で `removeForecastInput(id)` も呼び出す
3. `src/lib/__tests__/market-cap-forecast.test.ts` を新規作成し、計算ロジックと永続化をテストする
4. README.md に新機能の説明を追記する

## 変更するコンポーネント

* `src/components/Dashboard.tsx`(タブ追加、新セクションの UI 実装)
* 新規: `src/lib/market-cap-forecast.ts`
* 新規: `src/lib/__tests__/market-cap-forecast.test.ts`
* `README.md`(機能説明の追記)

## データ構造の変更

既存の `WatchedCompany`(`watchlist.ts`)は変更しない。新しい入力値は companyId をキーとする独立レコードとして `market-cap-forecast.ts` 側で管理する(`docs/functional-design.md` のデータモデル参照)。

```ts
export interface MarketCapForecastInput {
  currentMarketCapOku: number | null;
  volumeChangeRatePercent: number;
  priceChangeRatePercent: number;
  remainingQuarters: number;
}

export interface MarketCapForecastResult {
  revenueChangeRate: number;
  nextQuarterMarketCapOku: number;
  nextQuarterChangeRate: number;
  nextFullYearMarketCapOku: number;
  nextFullYearChangeRate: number;
}
```

計算式:

```
revenueChangeRate = (1 + volumeChangeRatePercent/100) * (1 + priceChangeRatePercent/100) - 1
nextQuarterMarketCapOku = currentMarketCapOku * (1 + revenueChangeRate)
nextFullYearMarketCapOku = currentMarketCapOku * (1 + revenueChangeRate) ^ remainingQuarters
changeRate = マーケットキャップ / currentMarketCapOku - 1
```

## 影響範囲の分析

* 既存の `watchlist.ts` の型・API・localStorage キーは変更しないため、既存機能(監視銘柄・自社株買い)への影響はない
* `Dashboard.tsx` は既存の2タブの分岐に3つ目のタブを追加する形になるため、既存タブの JSX ツリーはそのまま維持し、新タブ用の分岐を追加する
* 新規 localStorage キー(`ir-watch:market-cap-forecast`)を追加するのみで、既存キーの読み書きロジックには手を入れない
* ビルド・デプロイパイプライン(`scripts/fetch-tdnet.ts`, `.github/workflows/deploy.yml`)への変更はない
