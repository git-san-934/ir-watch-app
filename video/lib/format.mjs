// Turns the figures in data/*.json into display strings and fills {{...}} placeholders,
// so that no number is ever typed into the script by hand.

const decimalsOf = (fig) => fig.decimals ?? 0;

const formatNumber = (value, decimals) =>
  value.toLocaleString("ja-JP", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// 20500億円 -> 2兆500億円
const formatOku = (value) => {
  const cho = Math.floor(value / 10000);
  const oku = value % 10000;
  if (cho === 0) return `${formatNumber(oku, 0)}億円`;
  return oku === 0 ? `${cho}兆円` : `${cho}兆${formatNumber(oku, 0)}億円`;
};

/** Display string of a figure, e.g. "5,178億円", "-9.5%", "約2.5倍". */
export const formatFigure = (fig, { abs = false } = {}) => {
  const value = abs ? Math.abs(fig.value) : fig.value;
  const body = fig.unit === "億円" ? formatOku(value) : `${formatNumber(value, decimalsOf(fig))}${fig.unit}`;
  const sign = fig.signed && !abs && value > 0 ? "+" : "";
  return `${fig.approx ? "約" : ""}${sign}${body}`;
};

const formatDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
};

const metaValue = (data, name) => {
  switch (name) {
    case "company":
      return data.company;
    case "period":
      return data.period;
    case "months":
      return data.months;
    case "announcedAt":
      return formatDate(data.announcedAt);
    default:
      throw new Error(`unknown placeholder @${name}`);
  }
};

const PLACEHOLDER = /\{\{\s*(@?[\w]+)(?:\|(\w+))?\s*\}\}/g;

/** Fills {{key}}, {{key|abs}} and {{@meta}} placeholders from the data. Unknown keys throw. */
export const fill = (template, data) =>
  template.replace(PLACEHOLDER, (_, key, filter) => {
    if (key.startsWith("@")) return metaValue(data, key.slice(1));
    const fig = data.figures[key];
    if (!fig) throw new Error(`unknown figure {{${key}}}`);
    if (filter && filter !== "abs") throw new Error(`unknown filter |${filter} in {{${key}}}`);
    return formatFigure(fig, { abs: filter === "abs" });
  });

/** Fills placeholders in every string of a JSON value. */
export const fillDeep = (value, data) => {
  if (typeof value === "string") return fill(value, data);
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, data));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, data)]));
  return value;
};

/** The text VOICEVOX reads: the display text with words it would misread replaced. */
export const toSpeech = (text, readings) =>
  Object.entries(readings ?? {}).reduce((acc, [word, reading]) => acc.split(word).join(reading), text);
