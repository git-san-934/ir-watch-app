// Reads out/speech.json aloud with a VOICEVOX engine and writes one wav per beat.
// Usage: node scripts/voicevox.mjs --speaker <style id> [--out out/audio] [--speed 1.0] [--engine http://127.0.0.1:50021]
// Also writes <out>/readings.txt: how the engine reads each line (katakana), to check numbers by ear and eye.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { OUT_DIR } from "../lib/build.mjs";

const { values } = parseArgs({
  options: {
    speaker: { type: "string" },
    out: { type: "string", default: path.join(OUT_DIR, "audio") },
    speed: { type: "string", default: "1.0" },
    engine: { type: "string", default: process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021" },
  },
});
if (!values.speaker) throw new Error("--speaker <style id> is required (GET /speakers lists them)");

const post = async (endpoint, params, body) => {
  const url = `${values.engine}${endpoint}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${endpoint}: ${res.status} ${await res.text()}`);
  return res;
};

// duration of a 16-bit PCM wav, from its header
const wavSeconds = (buf) => buf.readUInt32LE(40) / buf.readUInt32LE(28);

const lines = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "speech.json"), "utf-8"));
fs.mkdirSync(values.out, { recursive: true });
const readings = [];
let total = 0;
for (const { file, text } of lines) {
  const query = await (await post("/audio_query", { text, speaker: values.speaker })).json();
  query.speedScale = Number(values.speed);
  const wav = Buffer.from(await (await post("/synthesis", { speaker: values.speaker }, query)).arrayBuffer());
  fs.writeFileSync(path.join(values.out, file), wav);
  const seconds = wavSeconds(wav);
  total += seconds;
  readings.push(`${file} (${seconds.toFixed(1)}s)\n  ${text}\n  ${query.kana}`);
  console.log(`${file}: ${seconds.toFixed(1)}s`);
}
fs.writeFileSync(path.join(values.out, "readings.txt"), readings.join("\n\n") + "\n");
console.log(`total speech: ${total.toFixed(1)}s`);
