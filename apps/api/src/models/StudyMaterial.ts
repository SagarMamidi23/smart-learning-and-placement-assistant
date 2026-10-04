import { Schema, model } from "mongoose";

const studyMaterialSchema = new Schema(
  {
    domain: { type: String, required: true, index: true },
    title: { type: String, required: true },
    /** Where the document came from: a URL or a description of the publisher. */
    source: { type: String, required: true },
    license: { type: String, required: true },
    fileKey: { type: String, default: null },
    pages: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    embeddingModel: { type: String, default: "" },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const StudyMaterial = model("StudyMaterial", studyMaterialSchema);

/** One passage of a study document, with its embedding. Tagged with domain, title and page for filtering and citations. */
const studyChunkSchema = new Schema({
  materialId: { type: Schema.Types.ObjectId, ref: "StudyMaterial", required: true, index: true },
  domain: { type: String, required: true, index: true },
  title: { type: String, required: true },
  page: { type: Number, required: true },
  index: { type: Number, required: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
});

export const StudyChunk = model("StudyChunk", studyChunkSchema);

export function toMaterialDto(m: unknown) {
  const d = m as {
    _id: unknown;
    domain: string;
    title: string;
    source: string;
    license: string;
    pages: number;
    chunkCount: number;
    createdAt: Date;
  };
  return {
    id: String(d._id),
    domain: d.domain,
    title: d.title,
    source: d.source,
    license: d.license,
    pages: d.pages,
    chunkCount: d.chunkCount,
    uploadedAt: d.createdAt.toISOString(),
  };
}
