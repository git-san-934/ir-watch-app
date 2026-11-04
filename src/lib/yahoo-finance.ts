// Yahoo!ファイナンス (Japan) quote page for a TSE-listed security, e.g.
// https://finance.yahoo.co.jp/quote/7203.T. Alphanumeric codes such as
// "130A" use the same ".T" suffix; Yahoo expects them upper-cased.
export function yahooFinanceUrl(code: string): string {
  return `https://finance.yahoo.co.jp/quote/${encodeURIComponent(code.trim().toUpperCase())}.T`;
}
