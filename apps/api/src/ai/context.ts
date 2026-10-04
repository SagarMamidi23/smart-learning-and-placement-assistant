import type { Education } from "@slp/shared";
import { AppError } from "../errors";
import { DomainConfig } from "../models/DomainConfig";
import { StudentProfile } from "../models/StudentProfile";
import type { ProfileEvidence } from "./prompts/common";

export function evidenceOf(profile: {
  education: unknown;
  skills: string[];
  interests: string[];
  resumeText?: string | null;
}): ProfileEvidence {
  return {
    education: profile.education as Education[],
    skills: profile.skills,
    interests: profile.interests,
    resumeText: profile.resumeText ?? "",
  };
}

/** The student's profile plus their active domain's config, or a clear 409 telling them what to do first. */
export async function loadStudentContext(userId: string) {
  const profile = await StudentProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true },
  );
  if (!profile.activeDomain) {
    throw new AppError(409, "NO_ACTIVE_DOMAIN", "Choose a career domain first.");
  }
  const domain = await DomainConfig.findOne({ slug: profile.activeDomain, isActive: true }).lean();
  if (!domain) {
    throw new AppError(
      409,
      "DOMAIN_UNAVAILABLE",
      "Your chosen domain is no longer available. Please choose another.",
    );
  }
  return { profile, domain };
}
