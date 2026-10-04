"use client";

import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorAlert, Field, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAdminDomains } from "@/lib/hooks";
import { useDeleteMaterial, useStudyMaterials, useUploadMaterial } from "@/lib/mentorHooks";

export default function StudyMaterialPage() {
  return (
    <AppShell adminOnly>
      <StudyMaterial />
    </AppShell>
  );
}

function StudyMaterial() {
  const domains = useAdminDomains();
  const materials = useStudyMaterials();
  const upload = useUploadMaterial();
  const del = useDeleteMaterial();
  const file = useRef<HTMLInputElement>(null);
  const [domain, setDomain] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [license, setLicense] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setDone(undefined);
    const f = file.current?.files?.[0];
    if (!domain || !f || !title.trim() || !source.trim() || !license.trim()) {
      setError("Choose a domain and PDF, and fill in the title, source and license.");
      return;
    }
    try {
      const res = await upload.mutateAsync({ domain, title, source, license, file: f });
      setDone(
        `Added "${res.material.title}": ${res.material.pages} pages, ${res.material.chunkCount} passages.`,
      );
      setTitle("");
      setSource("");
      setLicense("");
      if (file.current) file.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    }
  }

  const nameOf = (slug: string) => domains.data?.find((d) => d.slug === slug)?.name ?? slug;

  return (
    <>
      <h1 className="text-2xl font-bold">Study material</h1>
      <p className="mt-2 text-sm text-slate-500">
        PDFs with selectable text only (scanned pages need OCR first). Record where each document
        came from and its license, since the mentor quotes from it.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-6 grid max-w-2xl gap-4">
        <div>
          <label htmlFor="domain" className="block text-sm font-medium">
            Domain
          </label>
          <select
            id="domain"
            className={inputClass}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          >
            <option value="">Choose…</option>
            {domains.data?.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <Field id="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Field
          id="source"
          label="Source (URL or publisher)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <Field
          id="license"
          label="License (for example CC BY 4.0, public domain, permission granted)"
          value={license}
          onChange={(e) => setLicense(e.target.value)}
        />
        <div>
          <label htmlFor="pdf" className="block text-sm font-medium">
            PDF file (up to 30 MB)
          </label>
          <input
            id="pdf"
            ref={file}
            type="file"
            accept="application/pdf,.pdf"
            className="mt-1 block"
          />
        </div>
        <ErrorAlert message={error} />
        {done && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            {done}
          </p>
        )}
        <div>
          <button className={primaryButton} disabled={upload.isPending}>
            {upload.isPending ? "Reading and indexing…" : "Upload and index"}
          </button>
          {upload.isPending && (
            <span role="status" className="ml-3 text-sm text-slate-500">
              Large documents can take a minute.
            </span>
          )}
        </div>
      </form>

      <h2 className="mt-10 text-lg font-semibold">Uploaded documents</h2>
      {materials.isLoading && <p role="status">Loading…</p>}
      {materials.data?.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">Nothing uploaded yet.</p>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="py-2 pr-4">Title</th>
              <th className="py-2 pr-4">Domain</th>
              <th className="py-2 pr-4">License</th>
              <th className="py-2 pr-4">Pages</th>
              <th className="py-2 pr-4">Passages</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {materials.data?.map((m) => (
              <tr key={m.id} className="border-b border-slate-100 dark:border-slate-900">
                <td className="py-2 pr-4">
                  {m.title}
                  <div className="text-xs text-slate-500">{m.source}</div>
                </td>
                <td className="py-2 pr-4">{nameOf(m.domain)}</td>
                <td className="py-2 pr-4">{m.license}</td>
                <td className="py-2 pr-4">{m.pages}</td>
                <td className="py-2 pr-4">{m.chunkCount}</td>
                <td className="py-2">
                  <button
                    className={secondaryButton}
                    disabled={del.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${m.title}" and its passages?`)) del.mutate(m.id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
