"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { SourceRef } from "./stream";

export interface MentorMessage {
  role: "user" | "assistant";
  content: string;
  sources: SourceRef[];
  refused: boolean;
  createdAt: string;
}

export interface StudyMaterialDto {
  id: string;
  domain: string;
  title: string;
  source: string;
  license: string;
  pages: number;
  chunkCount: number;
  uploadedAt: string;
}

export const useMentorHistory = (enabled = true) =>
  useQuery({
    queryKey: ["mentor", "history"],
    enabled,
    queryFn: () =>
      api<{ domain: string; messages: MentorMessage[] }>("/mentor/history").then((r) => r.messages),
  });

export const useMentorStatus = (enabled = true) =>
  useQuery({
    queryKey: ["mentor", "status"],
    enabled,
    queryFn: () => api<{ domain: string; chunks: number; materials: number }>("/mentor/status"),
  });

export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/mentor/history", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mentor", "history"] }),
  });
}

export const useStudyMaterials = (domain?: string) =>
  useQuery({
    queryKey: ["admin", "study-material", domain ?? "all"],
    queryFn: () =>
      api<{ materials: StudyMaterialDto[] }>(
        `/admin/study-material${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`,
      ).then((r) => r.materials),
  });

export function useUploadMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      domain: string;
      title: string;
      source: string;
      license: string;
      file: File;
    }) => {
      const form = new FormData();
      form.append("domain", input.domain);
      form.append("title", input.title);
      form.append("source", input.source);
      form.append("license", input.license);
      form.append("file", input.file);
      return api<{ material: StudyMaterialDto }>("/admin/study-material", {
        method: "POST",
        body: form,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "study-material"] });
      qc.invalidateQueries({ queryKey: ["mentor", "status"] });
    },
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/study-material/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "study-material"] });
      qc.invalidateQueries({ queryKey: ["mentor", "status"] });
    },
  });
}
