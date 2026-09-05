/**
 * Client-side "market cap forecast" scenario tool. Like the rest of this
 * app, there is no server: the visitor enters a company's current market
 * cap plus an assumed sales-volume and unit-price change, and everything
 * below is a transparent formula computed in the browser — not a live
 * data feed and not a model that reasons in free text. See
 * docs/product-requirements.md ("今回のスコープ外・既知の制約") for why:
 * no free, verifiable-from-this-environment market-cap data source was
 * available, so the current market cap is a manual input rather than
 * fetched like the TDnet snapshot.
 */

import type { StorageLike } from "./watchlist";

export interface MarketCapForecastInput {
  currentMarketCapOku: number | null;
  volumeChangeRatePercent: number;
  priceChangeRatePercent: number;
  remainingQuarters: number;
}

export const DEFAULT_FORECAST_INPUT: MarketCapForecastInput = {
  currentMarketCapOku: null,
  volumeChangeRatePercent: 0,
  priceChangeRatePercent: 0,
  remainingQuarters: 4,
};

export interface MarketCapForecastResult {
  revenueChangeRate: number;
  nextQuarterMarketCapOku: number;
  nextQuarterChangeRate: number;
  nextFullYearMarketCapOku: number;
  nextFullYearChangeRate: number;
}

/**
 * Revenue is treated as volume × unit price, and market cap is assumed to
 * move proportionally to revenue with the valuation multiple held constant
 * — the simplest assumption that still lets volume and price move
 * independently (and in either direction). remainingQuarters compounds the
 * same quarterly rate out to the next full-year earnings date; pass 1 if
 * the next quarter *is* the next full-year earnings date.
 */
export function calculateForecast(
  input: MarketCapForecastInput
): MarketCapForecastResult | null {
  const { currentMarketCapOku, volumeChangeRatePercent, priceChangeRatePercent, remainingQuarters } =
    input;
  if (currentMarketCapOku === null || !Number.isFinite(currentMarketCapOku)) {
    return null;
  }

  const quarters = Math.max(1, Math.round(remainingQuarters));
  const volumeFactor = 1 + volumeChangeRatePercent / 100;
  const priceFactor = 1 + priceChangeRatePercent / 100;
  const revenueChangeRate = volumeFactor * priceFactor - 1;

  const nextQuarterMarketCapOku = currentMarketCapOku * (1 + revenueChangeRate);
  const nextFullYearMarketCapOku =
    currentMarketCapOku * Math.pow(1 + revenueChangeRate, quarters);

  return {
    revenueChangeRate,
    nextQuarterMarketCapOku,
    nextQuarterChangeRate: nextQuarterMarketCapOku / currentMarketCapOku - 1,
    nextFullYearMarketCapOku,
    nextFullYearChangeRate: nextFullYearMarketCapOku / currentMarketCapOku - 1,
  };
}

const FORECAST_INPUTS_KEY = "ir-watch:market-cap-forecast";

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function readAllForecastInputs(
  storage?: StorageLike
): Record<string, MarketCapForecastInput> {
  const store = getStorage(storage);
  if (!store) return {};
  const raw = store.getItem(FORECAST_INPUTS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllForecastInputs(
  inputs: Record<string, MarketCapForecastInput>,
  storage?: StorageLike
): void {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(FORECAST_INPUTS_KEY, JSON.stringify(inputs));
}

/** Returns the saved input for a company, or the defaults if none is saved yet. */
export function getForecastInput(
  companyId: string,
  storage?: StorageLike
): MarketCapForecastInput {
  const all = readAllForecastInputs(storage);
  return all[companyId] ?? { ...DEFAULT_FORECAST_INPUT };
}

export function setForecastInput(
  companyId: string,
  input: MarketCapForecastInput,
  storage?: StorageLike
): void {
  const all = readAllForecastInputs(storage);
  all[companyId] = input;
  writeAllForecastInputs(all, storage);
}

export function removeForecastInput(companyId: string, storage?: StorageLike): void {
  const all = readAllForecastInputs(storage);
  if (!(companyId in all)) return;
  delete all[companyId];
  writeAllForecastInputs(all, storage);
}
