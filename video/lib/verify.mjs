// Checks that every number in the generated script and slides comes from data/*.json,
// that derived figures (margin, multiple, progress) agree with the figures they come from,
// and that the script holds no investment advice.
import fs from "node:fs";
import path from "node:path";
import { fill, formatFigure, toSpeech } from "./format.mjs";

// Numbers written into the template itself, not taken from the data. Each needs a reason.
export const LITERAL_NUMBERS = [
  { text: "1分", reason: "動画の長さ" },
  { text: "4月から6月", reason: "第1四半期の期間(data.months と同じ期間の言い換え)" },
  { text: "Switch 2", reason: "商品名" },
];

export const FORBIDDEN_WORDS = ["買い", "売り", "買う", "売る", "推奨", "おすすめ", "目標株価", "割安", "割高"];

const hasDigit = (s) => /[0-9０-９]/.test(s);

/** Removes every allowed string (longest first) and returns what is left. */
const strip = (s, allowed) => [...allowed].sort((a, b) => b.length - a.length).reduce((acc, a) => acc.split(a).join(" "), s);

/** Every string that may carry a number: each figure as displayed, and the dated metadata. */
export const allowedStrings = (data) => {
  const out = new Set(LITERAL_NUMBERS.map((l) => l.text));
  for (const fig of Object.values(data.figures)) {
    out.add(formatFigure(fig));
    out.add(formatFigure(fig, { abs: true }));
  }
  for (const meta of ["@period", "@months", "@announcedAt"]) out.add(fill(`{{${meta}}}`, data));
  for (const source of data.sources) out.add(source);
  return out;
};

/** Strings in a JSON value, with their path. */
const strings = (value, at = "") => {
  if (typeof value === "string") return [{ at, s: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, at ? `${at}.${k}` : k));
  return [];
};

const svgTexts = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));

// A figure rounds half up unless data says otherwise ("rounding": "floor" keeps a value as it was announced).
const ROUNDING = {
  round: { name: "四捨五入", fn: Math.round },
  floor: { name: "切り捨て", fn: Math.floor },
};
const roundTo = (v, decimals, fn) => fn(v * 10 ** decimals + 1e-9) / 10 ** decimals;

/** Figures that can be recomputed from others. slack widens the tolerance when the inputs are rounded. */
export const DERIVED = [
  { key: "op_margin", from: "営業利益 ÷ 売上高", calc: (f) => (f.op_income.value / f.sales.value) * 100 },
  { key: "op_income_multiple", from: "1 + 営業利益の前年同期比", calc: (f) => 1 + f.op_income_yoy.value / 100 },
  { key: "op_progress", from: "営業利益 ÷ 通期予想営業利益", calc: (f) => (f.op_income.value / f.fy_forecast_op_income.value) * 100 },
  {
    key: "op_margin_prev",
    from: "前年同期の営業利益 ÷ 前年同期の売上高(前年同期比から逆算)",
    calc: (f) => (f.op_income.value / (1 + f.op_income_yoy.value / 100) / (f.sales.value / (1 + f.sales_yoy.value / 100))) * 100,
    slack: 0.1,
  },
];

export const checkDerived = (data) =>
  DERIVED.map(({ key, from, calc, slack = 0 }) => {
    const fig = data.figures[key];
    const decimals = fig.decimals ?? 0;
    const rounding = ROUNDING[fig.rounding ?? "round"];
    if (!rounding) return { level: "error", key, detail: `${fig.label}: rounding "${fig.rounding}" は round か floor にしてください` };
    const derived = calc(data.figures);
    const expected = roundTo(derived, decimals, rounding.fn);
    const diff = Math.abs(expected - fig.value);
    const unit = 10 ** -decimals;
    const detail = `${fig.label}: データ ${formatFigure(fig)} / 計算 ${derived.toFixed(decimals + 2)}(${from}、${rounding.name}すると ${expected})`;
    if (diff <= 1e-9 || Math.abs(derived - fig.value) <= unit / 2 + slack) return { level: "ok", key, detail };
    if (fig.approx && diff <= unit + 1e-9) return { level: "warn", key, detail: `${detail} — 「約」の値が${rounding.name}と合いません` };
    return { level: "error", key, detail };
  });

/**
 * Verifies the generated files in outDir against the template and data.
 * Returns a list of { level: "ok" | "warn" | "error", key, detail }.
 */
export const verify = ({ template, data, outDir }) => {
  const results = [];
  const push = (level, key, detail) => results.push({ level, key, detail });
  const allowed = allowedStrings(data);

  // 1. The template carries no numbers of its own except the listed literals: even a number
  // that matches the data today would go stale when the data changes.
  const literals = LITERAL_NUMBERS.map((l) => l.text);
  for (const { at, s } of strings({ title: template.title, beats: template.beats })) {
    const rest = strip(s.replace(/\{\{[^}]*\}\}/g, " "), literals);
    if (hasDigit(rest)) push("error", `template.${at}`, `テンプレートに手書きの数字があります: "${s}"`);
  }

  // 2. Every number in the generated script and slides is a figure from the data.
  const scriptPath = path.join(outDir, `${data.id}.mulmo.json`);
  if (!fs.existsSync(scriptPath)) {
    push("error", "script", `${scriptPath} がありません。先に build を実行してください`);
    return results;
  }
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const shown = [{ at: "title", s: script.title }];
  script.beats.forEach((beat, i) => {
    shown.push({ at: `beats[${i}].text`, s: beat.text });
    if (beat.image?.type === "image") {
      // the PNG is rasterized from the SVG next to it, whose text is what is checked
      const svg = fs.readFileSync(path.resolve(outDir, beat.image.source.path.replace(/\.png$/, ".svg")), "utf-8");
      svgTexts(svg).forEach((s, j) => shown.push({ at: `beats[${i}].slide.text[${j}]`, s }));
    } else {
      strings(beat.image, `beats[${i}].image`).forEach((x) => shown.push(x));
    }
  });
  let numbers = 0;
  for (const { at, s } of shown) {
    if (!hasDigit(s)) continue;
    numbers++;
    const rest = strip(s, allowed);
    if (hasDigit(rest)) push("error", at, `データにない数字があります: "${s}"(残り: "${rest.trim()}")`);
  }
  push("ok", "numbers", `数字を含む ${numbers} か所を data と照合しました`);

  // 3. The generated text is what the template gives for the current data (no stale build).
  template.beats.forEach((beat, i) => {
    const expected = fill(beat.text, data);
    if (script.beats[i]?.text !== expected) push("error", `beats[${i}].text`, `data と台本が一致しません。build し直してください: "${script.beats[i]?.text}" ≠ "${expected}"`);
  });

  // 4. VOICEVOX reads the same text, with only the listed readings changed.
  const speechPath = path.join(outDir, "speech.json");
  if (fs.existsSync(speechPath)) {
    const speech = JSON.parse(fs.readFileSync(speechPath, "utf-8"));
    script.beats.forEach((beat, i) => {
      const expected = toSpeech(beat.text, template.readings);
      if (speech[i]?.text !== expected) push("error", `speech[${i}]`, `読み上げ用テキストが台本と一致しません: "${speech[i]?.text}"`);
    });
  }

  // 5. Derived figures agree with the figures they are computed from.
  results.push(...checkDerived(data));

  // 6. No investment advice.
  for (const { at, s } of shown) {
    const word = FORBIDDEN_WORDS.find((w) => s.includes(w));
    if (word) push("error", at, `投資判断にあたる言葉「${word}」があります: "${s}"`);
  }
  return results;
};
