// Template + data -> MulmoScript, slide SVGs and the text VOICEVOX reads.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fill, fillDeep, formatFigure, toSpeech } from "./format.mjs";
import { AVATAR_POSITION, CANVAS, progressSlide, tableSlide, TEXT_SLIDE_CSS } from "./slides.mjs";

export const VIDEO_DIR = path.resolve(import.meta.dirname, "..");
export const OUT_DIR = path.join(VIDEO_DIR, "out");

export const loadTemplate = (templatePath) => {
  const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
  const data = JSON.parse(fs.readFileSync(path.resolve(path.dirname(templatePath), template.data), "utf-8"));
  return { template, data };
};

/** Fills the template. Pure: returns the beats with their text, speech and slide content. */
export const render = (template, data) => ({
  title: fill(template.title, data),
  speaker: template.speaker,
  beats: template.beats.map((beat) => {
    const text = fill(beat.text, data);
    const slide = fillDeep(beat.slide, data);
    if (slide.type === "progress") {
      slide.progress.currentDisplay = `${data.figures[slide.progress.current].label} ${formatFigure(data.figures[slide.progress.current])}`;
      slide.progress.targetDisplay = formatFigure(data.figures[slide.progress.target]);
    }
    return { id: beat.id, text, speech: toSpeech(text, template.readings), slide };
  }),
});

// MulmoCast has no renderer for its "svg" image type, so slides are rasterized here with Chromium.
const chromePath = () => {
  const found = process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!found) throw new Error("set CHROME_PATH (or PUPPETEER_EXECUTABLE_PATH) to a Chrome/Chromium binary");
  return found;
};

// Headless Chrome's screenshot viewport comes out shorter than --window-size, so the SVG is shown
// in a page whose background fills the strip it leaves.
const svgToPng = (svgFile, pngFile) => {
  const page = svgFile.replace(/\.svg$/, ".html");
  fs.writeFileSync(page, `<!doctype html><html style="margin:0;background:#FBF7EF"><body style="margin:0"><img src="${path.basename(svgFile)}" style="display:block;width:${CANVAS.width}px"></body></html>`);
  execFileSync(chromePath(), [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    `--window-size=${CANVAS.width},${CANVAS.height}`,
    `--screenshot=${pngFile}`,
    `file://${page}`,
  ], { stdio: "ignore" });
};

const slideImage = (slide, data, file) => {
  if (slide.type === "textSlide") {
    const content = { ...slide };
    delete content.type;
    return { type: "textSlide", slide: content };
  }
  const svg = slide.type === "table" ? tableSlide(slide, data.sources) : progressSlide(slide, data, data.sources);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, svg);
  const png = file.replace(/\.svg$/, ".png");
  svgToPng(file, png);
  return { type: "image", source: { kind: "path", path: path.relative(OUT_DIR, png) } };
};

/**
 * Writes out/<id>.mulmo.json, out/slides/*.svg and out/speech.json.
 * A beat uses out/audio/<n>_<id>.wav when that file exists (made by the VOICEVOX step).
 */
export const build = (templatePath, { avatar } = {}) => {
  const { template, data } = loadTemplate(templatePath);
  const rendered = render(template, data);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const beats = rendered.beats.map((beat, i) => {
    const name = `${i + 1}_${beat.id}`;
    const audio = path.join(OUT_DIR, "audio", `${name}.wav`);
    return {
      id: beat.id,
      speaker: rendered.speaker,
      text: beat.text,
      ...(fs.existsSync(audio) ? { audio: { type: "audio", source: { kind: "path", path: path.relative(OUT_DIR, audio) } } } : {}),
      image: slideImage(beat.slide, data, path.join(OUT_DIR, "slides", `${name}.svg`)),
    };
  });

  const script = {
    $mulmocast: { version: "1.1" },
    lang: "ja",
    title: rendered.title,
    canvasSize: CANVAS,
    textSlideParams: { cssStyles: TEXT_SLIDE_CSS },
    avatarParams: { position: AVATAR_POSITION },
    speechParams: {
      speakers: {
        [rendered.speaker]: {
          // the voice comes from the VOICEVOX wav files; this entry only names the speaker
          voiceId: "voicevox",
          ...(avatar ? { avatar: { source: path.relative(OUT_DIR, avatar) } } : {}),
        },
      },
    },
    beats,
  };
  const scriptPath = path.join(OUT_DIR, `${data.id}.mulmo.json`);
  fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2) + "\n");
  fs.writeFileSync(
    path.join(OUT_DIR, "speech.json"),
    JSON.stringify(rendered.beats.map((b, i) => ({ file: `${i + 1}_${b.id}.wav`, text: b.speech })), null, 2) + "\n",
  );
  return { scriptPath, script, rendered, data };
};
