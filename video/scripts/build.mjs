// Usage: node scripts/build.mjs [template]   (default: script/nintendo_fy27q1.template.json)
import fs from "node:fs";
import path from "node:path";
import { build, VIDEO_DIR } from "../lib/build.mjs";

const templatePath = path.resolve(process.argv[2] ?? path.join(VIDEO_DIR, "script", "nintendo_fy27q1.template.json"));
const avatarDir = path.join(VIDEO_DIR, "avatar", "meg");
const { scriptPath, script } = build(templatePath, { avatar: fs.existsSync(avatarDir) ? avatarDir : undefined });

console.log(`wrote ${path.relative(process.cwd(), scriptPath)}`);
const withAudio = script.beats.filter((b) => b.audio).length;
console.log(`beats: ${script.beats.length} (audio: ${withAudio}/${script.beats.length}, avatar: ${fs.existsSync(avatarDir) ? "yes" : "no"})`);
