"use client";

import { useState } from "react";
import { profileUpdateSchema, type Education, type StudentProfileDto } from "@slp/shared";
import { ApiError } from "@/lib/api";
import { useUpdateProfile } from "@/lib/hooks";
import { ErrorAlert, Field, primaryButton, secondaryButton } from "./ui";

const emptyEducation = (): Education => ({ degree: "", institution: "" });
const toList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function ProfileForm({ profile }: { profile: StudentProfileDto }) {
  const update = useUpdateProfile();
  const [education, setEducation] = useState<Education[]>(profile.education);
  const [skills, setSkills] = useState(profile.skills.join(", "));
  const [interests, setInterests] = useState(profile.interests.join(", "));
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const patch = (i: number, change: Partial<Education>) =>
    setEducation((rows) => rows.map((r, j) => (j === i ? { ...r, ...change } : r)));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(undefined);
    const parsed = profileUpdateSchema.safeParse({
      education: education.filter((r) => r.degree || r.institution),
      skills: toList(skills),
      interests: toList(interests),
    });
    if (!parsed.success) {
      setError("Each education entry needs a degree and an institution.");
      return;
    }
    try {
      await update.mutateAsync(parsed.data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-8">
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Education</legend>
        {education.map((row, i) => (
          <div
            key={i}
            className="grid gap-3 rounded-md border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800"
          >
            <Field
              id={`degree-${i}`}
              label="Degree"
              value={row.degree}
              onChange={(e) => patch(i, { degree: e.target.value })}
            />
            <Field
              id={`inst-${i}`}
              label="Institution"
              value={row.institution}
              onChange={(e) => patch(i, { institution: e.target.value })}
            />
            <Field
              id={`field-${i}`}
              label="Field of study"
              value={row.fieldOfStudy ?? ""}
              onChange={(e) => patch(i, { fieldOfStudy: e.target.value || undefined })}
            />
            <Field
              id={`end-${i}`}
              label="Graduation year"
              type="number"
              value={row.endYear ?? ""}
              onChange={(e) =>
                patch(i, { endYear: e.target.value ? Number(e.target.value) : undefined })
              }
            />
            <button
              type="button"
              className={`${secondaryButton} w-fit`}
              onClick={() => setEducation((r) => r.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setEducation((r) => [...r, emptyEducation()])}
        >
          Add education
        </button>
      </fieldset>

      <Field
        id="skills"
        label="Skills (comma separated)"
        value={skills}
        onChange={(e) => setSkills(e.target.value)}
      />
      <Field
        id="interests"
        label="Interests (comma separated)"
        value={interests}
        onChange={(e) => setInterests(e.target.value)}
      />

      <ErrorAlert message={error} />
      <div className="flex items-center gap-4">
        <button type="submit" disabled={update.isPending} className={primaryButton}>
          {update.isPending ? "Saving…" : "Save profile"}
        </button>
        <span role="status" className="text-sm text-green-700 dark:text-green-400">
          {saved ? "Profile saved." : ""}
        </span>
      </div>
    </form>
  );
}
