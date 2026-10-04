import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { slugSchema } from "@slp/shared";
import { deleteMaterial, ingestMaterial } from "../ai/rag/ingest";
import { config } from "../config";
import { AppError, asyncHandler, parse } from "../errors";
import { authenticate, requireRole } from "../middleware/auth";
import { DomainConfig } from "../models/DomainConfig";
import { StudyMaterial, toMaterialDto } from "../models/StudyMaterial";

/** Admin management of the RAG knowledge base. */
export const studyMaterialRouter = Router();
studyMaterialRouter.use(authenticate, requireRole("admin"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxMaterialBytes, files: 1 },
});

const metaSchema = z.object({
  domain: slugSchema,
  title: z.string().trim().min(3).max(200),
  source: z.string().trim().min(3).max(400),
  license: z.string().trim().min(2).max(120),
});

studyMaterialRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = typeof req.query.domain === "string" ? { domain: req.query.domain } : {};
    const items = await StudyMaterial.find(filter).sort({ createdAt: -1 });
    res.json({ materials: items.map(toMaterialDto) });
  }),
);

studyMaterialRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const meta = parse(metaSchema, req.body);
    if (!req.file) throw new AppError(400, "NO_FILE", 'Attach a PDF in the "file" field');
    if (!(await DomainConfig.exists({ slug: meta.domain }))) {
      throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain not found");
    }
    const material = await ingestMaterial({
      ...meta,
      buffer: req.file.buffer,
      uploadedBy: req.auth!.userId,
    });
    res.status(201).json({ material: toMaterialDto(material) });
  }),
);

studyMaterialRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!/^[0-9a-f]{24}$/.test(id)) throw new AppError(400, "BAD_ID", "Invalid id");
    if (!(await deleteMaterial(id)))
      throw new AppError(404, "NOT_FOUND", "Study material not found");
    res.status(204).end();
  }),
);
