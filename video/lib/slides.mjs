// Self-made slide images (SVG) for the number scenes. Everything shown comes from the filled
// template, so the numbers on screen are the same strings the verifier checks.

export const CANVAS = { width: 1080, height: 1920 };
// The avatar stands in the lower part of the canvas; slide content stays above this line.
const CONTENT_BOTTOM = 1100;

const COLORS = {
  bg: "#FBF7EF",
  ink: "#2B2A33",
  muted: "#6B6875",
  accent: "#1F5F8B",
  rule: "#D9D2C3",
  bar: "#E6DFD0",
};
const FONT = "'Noto Sans CJK JP', 'Noto Sans JP', 'WenQuanYi Zen Hei', sans-serif";

/** CSS for MulmoCast's textSlide, so it matches the SVG slides. */
export const TEXT_SLIDE_CSS = [
  `html, body { background: ${COLORS.bg}; }`,
  `html { border-top: 16px solid ${COLORS.accent}; }`,
  `body { font-family: ${FONT}; color: ${COLORS.ink}; padding: 120px 70px 0; box-sizing: border-box; }`,
  `h1 { font-size: 68px; font-weight: 700; text-align: center; margin: 0 0 40px; }`,
  `h2 { font-size: 40px; font-weight: 400; color: ${COLORS.muted}; text-align: center; }`,
  `ul { font-size: 46px; line-height: 1.5; padding-left: 1.2em; margin-top: 80px; }`,
  `li { margin-bottom: 36px; }`,
  `li::marker { color: ${COLORS.accent}; }`,
];

// Where the avatar stands: centred at the bottom, below CONTENT_BOTTOM.
export const AVATAR_POSITION = { x: "50%", y: "100%", scale: "42%" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const text = (x, y, s, { size = 44, weight = 400, fill = COLORS.ink, anchor = "start" } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

const frame = (title, body, sources) => `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" font-family="${FONT}">
<rect width="100%" height="100%" fill="${COLORS.bg}"/>
<rect x="0" y="0" width="${CANVAS.width}" height="16" fill="${COLORS.accent}"/>
${text(CANVAS.width / 2, 200, title, { size: 68, weight: 700, anchor: "middle" })}
${body}
${text(CANVAS.width / 2, CONTENT_BOTTOM + 40, `出典: ${sources.join("、")}`, { size: 26, fill: COLORS.muted, anchor: "middle" })}
</svg>
`;

/** A table: header row plus rows of [label, value, change]. */
export const tableSlide = ({ title, header, rows }, sources) => {
  const left = 60;
  const right = CANVAS.width - 60;
  const cols = [left + 10, 560, right - 10]; // label (start), value (end), change (end)
  const rowHeight = Math.min(170, (CONTENT_BOTTOM - 420) / rows.length);
  const parts = [];
  header.forEach((h, i) => parts.push(text(cols[i], 340, h, { size: 34, fill: COLORS.muted, anchor: i === 0 ? "start" : "end" })));
  parts.push(`<line x1="${left}" y1="370" x2="${right}" y2="370" stroke="${COLORS.ink}" stroke-width="3"/>`);
  rows.forEach((row, r) => {
    const y = 370 + rowHeight * (r + 0.62);
    parts.push(text(cols[0], y, row[0], { size: 46, weight: 700 }));
    parts.push(text(cols[1], y, row[1], { size: 54, weight: 700, fill: COLORS.accent, anchor: "end" }));
    parts.push(text(cols[2], y, row[2], { size: row[2].length > 10 ? 34 : 44, anchor: "end" }));
    const ly = 370 + rowHeight * (r + 1);
    parts.push(`<line x1="${left}" y1="${ly}" x2="${right}" y2="${ly}" stroke="${COLORS.rule}" stroke-width="2"/>`);
  });
  return frame(title, parts.join("\n"), sources);
};

/** Headline lines plus a progress bar of one figure against another. */
export const progressSlide = ({ title, lines, progress, footer }, data, sources) => {
  const parts = lines.map((line, i) => text(CANVAS.width / 2, 340 + i * 90, line, { size: 54, weight: 700, anchor: "middle" }));
  const current = data.figures[progress.current];
  const target = data.figures[progress.target];
  const ratio = Math.max(0, Math.min(1, current.value / target.value));
  const x = 90;
  const w = CANVAS.width - 180;
  const y = 620;
  parts.push(text(x, y - 30, progress.label, { size: 40, fill: COLORS.muted }));
  parts.push(text(x + w, y - 30, progress.display, { size: 56, weight: 700, fill: COLORS.accent, anchor: "end" }));
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="70" rx="35" fill="${COLORS.bar}"/>`);
  parts.push(`<rect x="${x}" y="${y}" width="${(w * ratio).toFixed(1)}" height="70" rx="35" fill="${COLORS.accent}"/>`);
  parts.push(text(x, y + 130, progress.currentDisplay, { size: 36, fill: COLORS.muted }));
  parts.push(text(x + w, y + 130, `通期予想 ${progress.targetDisplay}`, { size: 36, fill: COLORS.muted, anchor: "end" }));
  if (footer) parts.push(text(CANVAS.width / 2, 960, footer, { size: 40, weight: 700, anchor: "middle" }));
  return frame(title, parts.join("\n"), sources);
};
