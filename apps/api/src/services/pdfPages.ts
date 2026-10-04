import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import type { PageText } from "../ai/rag/chunk";

const MAX_PAGES = 500;

/** Text of each page, so chunks can carry exact page numbers. Throws if the file can't be parsed. */
export async function extractPages(buf: Buffer): Promise<PageText[]> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  }).promise;
  try {
    const pages: PageText[] = [];
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
      }
      pages.push({ page: p, text: text.replaceAll("\0", "") });
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
