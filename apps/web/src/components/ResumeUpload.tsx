"use client";

import { useRef, useState } from "react";
import type { StudentProfileDto } from "@slp/shared";
import { API_BASE, ApiError } from "@/lib/api";
import { useDeleteResume, useUploadResume } from "@/lib/hooks";
import { ErrorAlert, primaryButton, secondaryButton } from "./ui";

const MAX_BYTES = 5 * 1024 * 1024;

export function ResumeUpload({ profile }: { profile: StudentProfileDto }) {
  const upload = useUploadResume();
  const remove = useDeleteResume();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(undefined);
    setWarning(undefined);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
    } else if (file.size > MAX_BYTES) {
      setError("The file is larger than 5 MB.");
    } else {
      try {
        const res = await upload.mutateAsync(file);
        setWarning(res.warning);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Upload failed.");
      }
    }
    if (input.current) input.current.value = "";
  }

  return (
    <section aria-labelledby="resume-heading" className="mt-12">
      <h2 id="resume-heading" className="text-lg font-semibold">
        Resume
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Optional. PDF up to 5 MB. We extract the text to compare your skills against your chosen
        domain.
      </p>
      {profile.hasResume && profile.resumeUrl && (
        <p className="mt-3 text-sm">
          Resume on file ({profile.resumeTextLength.toLocaleString()} characters read).{" "}
          <a
            className="text-indigo-600 underline dark:text-indigo-400"
            href={`${API_BASE}${profile.resumeUrl}`}
            target="_blank"
            rel="noreferrer"
          >
            View
          </a>
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <label className={`${primaryButton} cursor-pointer`}>
          {upload.isPending ? "Uploading…" : profile.hasResume ? "Replace resume" : "Upload resume"}
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={onChange}
            disabled={upload.isPending}
          />
        </label>
        {profile.hasResume && (
          <button
            className={secondaryButton}
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Remove
          </button>
        )}
      </div>
      <ErrorAlert message={error} />
      {warning && (
        <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          {warning}
        </p>
      )}
    </section>
  );
}
