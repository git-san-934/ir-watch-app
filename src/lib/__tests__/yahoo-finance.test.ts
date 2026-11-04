import { describe, expect, it } from "vitest";
import { yahooFinanceUrl } from "@/lib/yahoo-finance";

describe("yahooFinanceUrl", () => {
  it("builds a quote URL for a numeric TSE code", () => {
    expect(yahooFinanceUrl("7203")).toBe("https://finance.yahoo.co.jp/quote/7203.T");
  });

  it("upper-cases alphanumeric codes", () => {
    expect(yahooFinanceUrl("130a")).toBe("https://finance.yahoo.co.jp/quote/130A.T");
  });

  it("trims surrounding whitespace", () => {
    expect(yahooFinanceUrl(" 9984 ")).toBe("https://finance.yahoo.co.jp/quote/9984.T");
  });
});
