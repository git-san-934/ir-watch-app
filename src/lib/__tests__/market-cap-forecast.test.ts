import { describe, expect, it } from "vitest";
import {
  calculateForecast,
  DEFAULT_FORECAST_INPUT,
  getForecastInput,
  removeForecastInput,
  setForecastInput,
  type MarketCapForecastInput,
} from "@/lib/market-cap-forecast";
import type { StorageLike } from "@/lib/watchlist";

function createMemoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function makeInput(overrides: Partial<MarketCapForecastInput> = {}): MarketCapForecastInput {
  return { ...DEFAULT_FORECAST_INPUT, ...overrides };
}

describe("calculateForecast", () => {
  it("returns null when the current market cap is not set", () => {
    expect(calculateForecast(makeInput({ currentMarketCapOku: null }))).toBeNull();
  });

  it("returns the unchanged market cap when both rates are 0%", () => {
    const result = calculateForecast(makeInput({ currentMarketCapOku: 1000 }));
    expect(result?.revenueChangeRate).toBeCloseTo(0);
    expect(result?.nextQuarterMarketCapOku).toBeCloseTo(1000);
    expect(result?.nextFullYearMarketCapOku).toBeCloseTo(1000);
  });

  it("combines volume and price increases multiplicatively", () => {
    const result = calculateForecast(
      makeInput({
        currentMarketCapOku: 1000,
        volumeChangeRatePercent: 10,
        priceChangeRatePercent: 5,
      })
    );
    // 1.10 * 1.05 - 1 = 0.155
    expect(result?.revenueChangeRate).toBeCloseTo(0.155);
    expect(result?.nextQuarterMarketCapOku).toBeCloseTo(1155);
    expect(result?.nextQuarterChangeRate).toBeCloseTo(0.155);
  });

  it("handles a decrease in both volume and price", () => {
    const result = calculateForecast(
      makeInput({
        currentMarketCapOku: 1000,
        volumeChangeRatePercent: -20,
        priceChangeRatePercent: -10,
      })
    );
    // 0.80 * 0.90 - 1 = -0.28
    expect(result?.revenueChangeRate).toBeCloseTo(-0.28);
    expect(result?.nextQuarterMarketCapOku).toBeCloseTo(720);
  });

  it("compounds the quarterly rate out to the next full-year earnings", () => {
    const result = calculateForecast(
      makeInput({
        currentMarketCapOku: 1000,
        volumeChangeRatePercent: 10,
        remainingQuarters: 4,
      })
    );
    expect(result?.nextFullYearMarketCapOku).toBeCloseTo(1000 * Math.pow(1.1, 4));
  });

  it("treats a non-positive remainingQuarters as 1 quarter", () => {
    const result = calculateForecast(
      makeInput({ currentMarketCapOku: 1000, volumeChangeRatePercent: 10, remainingQuarters: 0 })
    );
    expect(result?.nextFullYearMarketCapOku).toBeCloseTo(1100);
  });

  it("lets volume and price move in opposite directions", () => {
    const result = calculateForecast(
      makeInput({
        currentMarketCapOku: 1000,
        volumeChangeRatePercent: 50,
        priceChangeRatePercent: -50,
      })
    );
    // 1.5 * 0.5 - 1 = -0.25
    expect(result?.revenueChangeRate).toBeCloseTo(-0.25);
  });
});

describe("forecast input storage", () => {
  it("returns default input when nothing is saved", () => {
    const storage = createMemoryStorage();
    expect(getForecastInput("company-1", storage)).toEqual(DEFAULT_FORECAST_INPUT);
  });

  it("saves and reloads input for a company", () => {
    const storage = createMemoryStorage();
    const input = makeInput({ currentMarketCapOku: 500, volumeChangeRatePercent: 15 });
    setForecastInput("company-1", input, storage);
    expect(getForecastInput("company-1", storage)).toEqual(input);
  });

  it("keeps inputs for different companies independent", () => {
    const storage = createMemoryStorage();
    setForecastInput("company-1", makeInput({ currentMarketCapOku: 100 }), storage);
    setForecastInput("company-2", makeInput({ currentMarketCapOku: 200 }), storage);
    expect(getForecastInput("company-1", storage).currentMarketCapOku).toBe(100);
    expect(getForecastInput("company-2", storage).currentMarketCapOku).toBe(200);
  });

  it("removes a company's saved input", () => {
    const storage = createMemoryStorage();
    setForecastInput("company-1", makeInput({ currentMarketCapOku: 100 }), storage);
    removeForecastInput("company-1", storage);
    expect(getForecastInput("company-1", storage)).toEqual(DEFAULT_FORECAST_INPUT);
  });

  it("returns default input instead of throwing on corrupt stored JSON", () => {
    const storage = createMemoryStorage();
    storage.setItem("ir-watch:market-cap-forecast", "not json");
    expect(getForecastInput("company-1", storage)).toEqual(DEFAULT_FORECAST_INPUT);
  });
});
