import { AppError } from "../../errors";
import { StudyChunk, StudyMaterial } from "../../models/StudyMaterial";
import { extractPages } from "../../services/pdfPages";
import { isPdf } from "../../services/resumeText";
import { getStorage } from "../../storage";
import { getEmbedder } from "../embeddings";
import { chunkPages } from "./chunk";
import { invalidateDomain } from "./retrieve";

export interface IngestInput {
  domain: string;
  title: string;
  source: string;
  license: string;
  buffer: Buffer;
  uploadedBy?: string;
}

/**
 * PDF -> per-page text -> chunks -> embeddings -> MongoDB. Every chunk is tagged with its domain, the document
 * title and its page. If embedding fails part-way nothing is left behind.
 */
export async function ingestMaterial(input: IngestInput) {
  if (!isPdf(input.buffer)) throw new AppError(415, "NOT_A_PDF", "Only PDF files are accepted");

  let pages;
  try {
    pages = await extractPages(input.buffer);
  } catch {
    throw new AppError(422, "UNREADABLE_PDF", "Could not read this PDF");
  }
  const chunks = chunkPages(pages);
  if (chunks.length === 0) {
    throw new AppError(
      422,
      "NO_TEXT",
      "No text could be extracted. Scanned PDFs need OCR first; this file has no selectable text.",
    );
  }

  const embedder = getEmbedder();
  const material = await StudyMaterial.create({
    domain: input.domain,
    title: input.title,
    source: input.source,
    license: input.license,
    pages: pages.length,
    chunkCount: chunks.length,
    uploadedBy: input.uploadedBy,
  });
  try {
    const vectors = await embedder.embed(chunks.map((c) => c.text));
    await StudyChunk.insertMany(
      chunks.map((c, i) => ({
        materialId: material._id,
        domain: input.domain,
        title: input.title,
        page: c.page,
        index: c.index,
        text: c.text,
        embedding: vectors[i],
      })),
    );
    const fileKey = `study-material/${material._id}.pdf`;
    await getStorage().save(fileKey, input.buffer);
    material.fileKey = fileKey;
    material.embeddingModel = embedder.model;
    await material.save();
  } catch (e) {
    await StudyChunk.deleteMany({ materialId: material._id });
    await StudyMaterial.deleteOne({ _id: material._id });
    throw e;
  } finally {
    invalidateDomain(input.domain);
  }
  return material;
}

export async function deleteMaterial(id: string) {
  const material = await StudyMaterial.findById(id);
  if (!material) return null;
  await StudyChunk.deleteMany({ materialId: material._id });
  if (material.fileKey) await getStorage().remove(material.fileKey);
  await material.deleteOne();
  invalidateDomain(material.domain);
  return material;
}
