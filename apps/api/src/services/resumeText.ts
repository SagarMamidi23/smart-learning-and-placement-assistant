// The legacy build is the CommonJS one that runs on plain Node (no DOM or canvas needed for text).
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js";

const MAX_CHARS = 50_000;
const MAX_PAGES = 20;

export const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString("latin1") === "%PDF-";

/** Extracts plain text from a PDF. Throws if the file can't be parsed. */
export async function extractResumeText(buf: Buffer): Promise<string> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  }).promise;
  try {
    let text = "";
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let i = 1; i <= pages && text.length < MAX_CHARS; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
      }
      text += "\n";
    }
    return text
      .replaceAll("\0", "")
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_CHARS);
  } finally {
    await doc.destroy();
  }
}
