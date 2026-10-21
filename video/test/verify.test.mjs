import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fill, formatFigure } from "../lib/format.mjs";
import { verify } from "../lib/verify.mjs";

const data = JSON.parse(fs.readFileSync(new URL("../data/nintendo_fy27q1.json", import.meta.url), "utf-8"));

const setup = (beats) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-"));
  const template = { title: "{{@company}}", beats: beats.map(({ template }) => ({ text: template })) };
  const script = { title: data.company, beats: beats.map(({ template, shown }) => ({ text: shown ?? fill(template, data), image: { type: "textSlide", slide: { title: "t" } } })) };
  fs.writeFileSync(path.join(outDir, `${data.id}.mulmo.json`), JSON.stringify(script));
  return verify({ template, data, outDir }).filter((r) => r.level === "error");
};

test("formats figures as they appear in the script", () => {
  assert.equal(formatFigure(data.figures.sales), "5,178億円");
  assert.equal(formatFigure(data.figures.fy_forecast_sales), "2兆500億円");
  assert.equal(formatFigure(data.figures.sales_yoy), "-9.5%");
  assert.equal(formatFigure(data.figures.sales_yoy, { abs: true }), "9.5%");
  assert.equal(formatFigure(data.figures.switch2_sw_yoy), "+9.2%");
  assert.equal(formatFigure(data.figures.op_income_multiple), "約2.5倍");
  assert.equal(formatFigure(data.figures.tariff_refund), "約3億ドル");
});

test("passes a script built from the data", () => {
  assert.deepEqual(setup([{ template: "売上は{{sales}}で、{{sales_yoy|abs}}減りました。" }]), []);
});

test("fails a number changed in the generated script", () => {
  const errors = setup([{ template: "売上は{{sales}}です。", shown: "売上は5,187億円です。" }]);
  assert.ok(errors.some((e) => e.detail.includes("データにない数字")));
});

test("fails a number written into the template by hand", () => {
  const errors = setup([{ template: "売上は5,178億円です。" }]);
  assert.ok(errors.some((e) => e.detail.includes("手書きの数字")));
});

test("fails investment advice", () => {
  const errors = setup([{ template: "今が買いですね。" }]);
  assert.ok(errors.some((e) => e.detail.includes("投資判断")));
});

test("fails an unknown placeholder", () => {
  assert.throws(() => fill("{{nope}}", data), /unknown figure/);
});
