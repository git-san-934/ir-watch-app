// Usage: node scripts/verify.mjs [template] [--strict]
// Exit code 1 on any error (and on warnings with --strict).
import path from "node:path";
import { loadTemplate, OUT_DIR, VIDEO_DIR } from "../lib/build.mjs";
import { verify } from "../lib/verify.mjs";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const templatePath = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(VIDEO_DIR, "script", "nintendo_fy27q1.template.json"));
const { template, data } = loadTemplate(templatePath);
const results = verify({ template, data, outDir: OUT_DIR });

const mark = { ok: "OK  ", warn: "WARN", error: "NG  " };
for (const r of results) console.log(`${mark[r.level]} ${r.key}: ${r.detail}`);
const errors = results.filter((r) => r.level === "error").length;
const warns = results.filter((r) => r.level === "warn").length;
console.log(`\n${errors} error(s), ${warns} warning(s)`);
process.exit(errors > 0 || (strict && warns > 0) ? 1 : 0);
