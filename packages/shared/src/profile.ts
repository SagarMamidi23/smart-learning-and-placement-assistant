import { z } from "zod";

export const educationSchema = z.object({
  degree: z.string().trim().min(1).max(120),
  institution: z.string().trim().min(1).max(160),
  fieldOfStudy: z.string().trim().max(120).optional(),
  startYear: z.number().int().min(1950).max(2100).optional(),
  endYear: z.number().int().min(1950).max(2100).optional(),
  score: z.string().trim().max(40).optional(),
});
export type Education = z.infer<typeof educationSchema>;

const tagList = z
  .array(z.string().trim().min(1).max(60))
  .max(50)
  .transform((a) => Array.from(new Set(a)));

export const profileUpdateSchema = z
  .object({
    education: z.array(educationSchema).max(10),
    skills: tagList,
    interests: tagList,
  })
  .partial()
  .strict();
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export interface StudentProfileDto {
  userId: string;
  education: Education[];
  skills: string[];
  interests: string[];
  resumeUrl: string | null;
  hasResume: boolean;
  resumeTextLength: number;
  resumeTextPreview: string;
  activeDomain: string | null;
  careerDiscoveryResult: unknown | null;
}
