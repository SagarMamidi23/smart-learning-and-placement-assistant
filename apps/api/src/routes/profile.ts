import { Router } from "express";
import multer from "multer";
import { profileUpdateSchema, selectDomainSchema } from "@slp/shared";
import { AppError, asyncHandler, parse } from "../errors";
import { StudentProfile, toProfileDto } from "../models/StudentProfile";
import { DomainConfig } from "../models/DomainConfig";
import { authenticate } from "../middleware/auth";
import { config } from "../config";
import { getStorage } from "../storage";
import { extractResumeText, isPdf } from "../services/resumeText";

export const profileRouter = Router();
profileRouter.use(authenticate);

const RESUME_URL = "/api/v1/profile/resume/file";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxResumeBytes, files: 1 },
});

const getOrCreate = (userId: string) =>
  StudentProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true },
  );

profileRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ profile: toProfileDto(await getOrCreate(req.auth!.userId)) });
  }),
);

profileRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const update = parse(profileUpdateSchema, req.body);
    const profile = await StudentProfile.findOneAndUpdate(
      { userId: req.auth!.userId },
      { $set: update },
      { upsert: true, new: true },
    );
    res.json({ profile: toProfileDto(profile) });
  }),
);

/** One active domain per student; calling this again switches it. */
profileRouter.put(
  "/domain",
  asyncHandler(async (req, res) => {
    const { slug } = parse(selectDomainSchema, req.body);
    if (!(await DomainConfig.exists({ slug, isActive: true }))) {
      throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain not found");
    }
    const profile = await StudentProfile.findOneAndUpdate(
      { userId: req.auth!.userId },
      { $set: { activeDomain: slug } },
      { upsert: true, new: true },
    );
    res.json({ profile: toProfileDto(profile) });
  }),
);

profileRouter.post(
  "/resume",
  upload.single("resume"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new AppError(400, "NO_FILE", 'Attach a PDF in the "resume" field');
    if (!isPdf(file.buffer)) throw new AppError(415, "NOT_A_PDF", "Only PDF files are accepted");

    let text: string;
    try {
      text = await extractResumeText(file.buffer);
    } catch {
      throw new AppError(422, "UNREADABLE_PDF", "Could not read this PDF");
    }

    const userId = req.auth!.userId;
    const key = `resumes/${userId}.pdf`;
    await getStorage().save(key, file.buffer);
    const profile = await StudentProfile.findOneAndUpdate(
      { userId },
      { $set: { resumeKey: key, resumeUrl: RESUME_URL, resumeText: text } },
      { upsert: true, new: true },
    );
    res.json({
      profile: toProfileDto(profile),
      warning: text ? undefined : "No text could be extracted; this may be a scanned PDF.",
    });
  }),
);

profileRouter.get(
  "/resume/file",
  asyncHandler(async (req, res) => {
    const profile = await StudentProfile.findOne({ userId: req.auth!.userId });
    if (!profile?.resumeKey) throw new AppError(404, "NO_RESUME", "No resume uploaded");
    const dl = await getStorage().download(profile.resumeKey);
    if (!dl) throw new AppError(404, "NO_RESUME", "Resume file not found");
    if (dl.kind === "redirect") return res.redirect(dl.url);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="resume.pdf"');
    res.on("close", () => dl.stream.destroy());
    dl.stream.pipe(res);
  }),
);

profileRouter.delete(
  "/resume",
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const profile = await StudentProfile.findOne({ userId });
    if (profile?.resumeKey) await getStorage().remove(profile.resumeKey);
    const updated = await StudentProfile.findOneAndUpdate(
      { userId },
      { $set: { resumeKey: null, resumeUrl: null, resumeText: "" } },
      { new: true },
    );
    res.json({ profile: updated ? toProfileDto(updated) : null });
  }),
);
