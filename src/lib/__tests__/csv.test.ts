import { describe, expect, it } from "vitest";
import { buildCsvChunks } from "@/lib/csv";

describe("buildCsvChunks", () => {
  it("produces a single unsuffixed file when rows fit in one chunk", () => {
    const chunks = buildCsvChunks(
      "export",
      ["a", "b"],
      [
        ["1", "2"],
        ["3", "4"],
      ]
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].filename).toBe("export.csv");
    expect(chunks[0].content).toBe('﻿"a","b"\r\n"1","2"\r\n"3","4"');
  });

  it("escapes embedded quotes", () => {
    const chunks = buildCsvChunks("export", ["a"], [['say "hi"']]);
    expect(chunks[0].content).toContain('"say ""hi"""');
  });

  it("splits rows into chunks of the given size, each carrying the header", () => {
    const rows = Array.from({ length: 2500 }, (_, i) => [String(i)]);
    const chunks = buildCsvChunks("export", ["code"], rows, 1000);

    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.filename)).toEqual([
      "export_1-3.csv",
      "export_2-3.csv",
      "export_3-3.csv",
    ]);
    expect(chunks[0].content.split("\r\n")).toHaveLength(1001); // header + 1000 rows
    expect(chunks[2].content.split("\r\n")).toHaveLength(501); // header + 500 rows
  });

  it("returns one empty-body chunk for zero rows", () => {
    const chunks = buildCsvChunks("export", ["code"], []);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].filename).toBe("export.csv");
    expect(chunks[0].content).toBe('﻿"code"');
  });
});
