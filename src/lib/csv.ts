/**
 * CSV export helpers used by the dashboard's "CSVで出力" buttons.
 *
 * `buildCsvChunks` is pure (easy to unit-test); `downloadCsvChunks` is the
 * thin browser-only wrapper that actually triggers the file downloads, one
 * per chunk with a short delay between them so browsers don't treat a burst
 * of `a.click()` calls as a popup flood and block the later ones.
 */

const DEFAULT_CHUNK_SIZE = 1000;
const DOWNLOAD_DELAY_MS = 300;

export interface CsvChunk {
  filename: string;
  content: string;
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsvContent(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(","));
  // Leading BOM so Excel on Windows detects UTF-8 instead of Shift-JIS.
  return "﻿" + lines.join("\r\n");
}

/**
 * Splits `rows` into CSV chunks of at most `chunkSize` rows each (plus the
 * repeated header), so a very large export doesn't end up as one unwieldy
 * file. Chunk filenames get a "_<n>-<total>" suffix only when there's more
 * than one chunk.
 */
export function buildCsvChunks(
  filenameBase: string,
  headers: string[],
  rows: string[][],
  chunkSize: number = DEFAULT_CHUNK_SIZE
): CsvChunk[] {
  const chunkCount = Math.max(1, Math.ceil(rows.length / chunkSize));
  return Array.from({ length: chunkCount }, (_, i) => {
    const slice = rows.slice(i * chunkSize, (i + 1) * chunkSize);
    const suffix = chunkCount > 1 ? `_${i + 1}-${chunkCount}` : "";
    return {
      filename: `${filenameBase}${suffix}.csv`,
      content: toCsvContent(headers, slice),
    };
  });
}

/** Triggers a browser download for each chunk, sequentially. */
export function downloadCsvChunks(chunks: CsvChunk[], delayMs: number = DOWNLOAD_DELAY_MS): void {
  let i = 0;
  function next() {
    if (i >= chunks.length) return;
    const { filename, content } = chunks[i];
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    i += 1;
    setTimeout(next, delayMs);
  }
  next();
}
