export interface PageText {
  page: number;
  text: string;
}

export interface Chunk {
  page: number;
  /** Position within the whole document, starting at 0. */
  index: number;
  text: string;
}

export interface ChunkOptions {
  /** Target maximum characters per chunk. */
  size: number;
  /** Characters repeated at the start of the next chunk, so an answer split across a boundary is still found. */
  overlap: number;
  /** Chunks shorter than this are dropped (page numbers, stray headings). */
  min: number;
}

export const DEFAULT_CHUNKING: ChunkOptions = { size: 900, overlap: 150, min: 60 };

/** Splits at sentence ends and blank lines, then hard-splits anything still longer than `size`. */
function units(text: string, size: number): string[] {
  const parts = text
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= size) {
      out.push(p);
      continue;
    }
    for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size));
  }
  return out;
}

/** Last ~`n` characters of `text`, starting at a word boundary. */
function tail(text: string, n: number): string {
  if (text.length <= n) return text;
  const cut = text.slice(text.length - n);
  const space = cut.indexOf(" ");
  return space >= 0 ? cut.slice(space + 1) : cut;
}

/**
 * Chunks per page so every chunk keeps an exact page number for citations. A chunk never spans pages,
 * which costs a little context at page breaks but makes "page 42" always true.
 */
export function chunkPages(pages: PageText[], opts: ChunkOptions = DEFAULT_CHUNKING): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  for (const { page, text } of pages) {
    let current = "";
    const flush = () => {
      const t = current.trim();
      if (t.length >= opts.min) chunks.push({ page, index: index++, text: t });
    };
    for (const u of units(text, opts.size)) {
      if (current && current.length + u.length + 1 > opts.size) {
        flush();
        current = tail(current, opts.overlap);
      }
      current = current ? `${current} ${u}` : u;
    }
    flush();
  }
  return chunks;
}
