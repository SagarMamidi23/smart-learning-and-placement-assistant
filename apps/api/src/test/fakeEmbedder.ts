import fs from "node:fs";
import path from "node:path";
import type { Embedder } from "../ai/embeddings";

const STOP = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was what when which who with into not only never can".split(
    " ",
  ),
);

/**
 * Deterministic stand-in for the real model: hashes content words into a 256-dim unit vector, so texts that share
 * meaningful words score high and unrelated texts score near zero. No network, no model download.
 */
export class FakeEmbedder implements Embedder {
  model = "fake-bow-256";
  calls: string[][] = [];

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push(texts);
    return texts.map((t) => {
      const v = new Array<number>(256).fill(0);
      for (const w of t.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
        if (STOP.has(w)) continue;
        let h = 0;
        for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        v[h % 256] += 1;
      }
      const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / n);
    });
  }
}

export const fixturePdf = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../../test/fixtures", name));
