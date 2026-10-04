"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DomainConfigData,
  DomainConfigInput,
  DomainSummary,
  DomainUpdateInput,
  LoginInput,
  ProfileUpdateInput,
  PublicUser,
  RegisterInput,
  StudentProfileDto,
} from "@slp/shared";
import { api, post, put } from "./api";

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: PublicUser }>("/auth/me").then((r) => r.user),
    retry: false,
    staleTime: 60_000,
  });

export function useAuthMutation(kind: "login" | "register") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput | RegisterInput) =>
      post<{ user: PublicUser }>(`/auth/${kind}`, input).then((r) => r.user),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<void>("/auth/logout"),
    onSettled: () => qc.clear(),
  });
}

export const useProfile = () =>
  useQuery({
    queryKey: ["profile"],
    queryFn: () => api<{ profile: StudentProfileDto }>("/profile").then((r) => r.profile),
  });

type ProfileResult = { profile: StudentProfileDto; warning?: string };

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdateInput) => put<ProfileResult>("/profile", input),
    onSuccess: (r) => qc.setQueryData(["profile"], r.profile),
  });
}

export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("resume", file);
      return api<ProfileResult>("/profile/resume", { method: "POST", body: form });
    },
    onSuccess: (r) => qc.setQueryData(["profile"], r.profile),
  });
}

export function useDeleteResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<ProfileResult>("/profile/resume", { method: "DELETE" }),
    onSuccess: (r) => qc.setQueryData(["profile"], r.profile),
  });
}

export type DomainDetail = Omit<DomainConfigData, "examCalendar"> & {
  examCalendar: DomainConfigData["examCalendar"];
  updatedAt?: string;
};

export const useDomains = () =>
  useQuery({
    queryKey: ["domains"],
    queryFn: () => api<{ domains: DomainSummary[] }>("/domains").then((r) => r.domains),
    staleTime: 5 * 60_000,
  });

export const useDomain = (slug: string) =>
  useQuery({
    queryKey: ["domain", slug],
    enabled: Boolean(slug),
    queryFn: () => api<{ domain: DomainDetail }>(`/domains/${slug}`).then((r) => r.domain),
  });

export function useSelectDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => put<{ profile: StudentProfileDto }>("/profile/domain", { slug }),
    onSuccess: (r) => qc.setQueryData(["profile"], r.profile),
  });
}

export const useAdminDomains = () =>
  useQuery({
    queryKey: ["admin", "domains"],
    queryFn: () => api<{ domains: DomainSummary[] }>("/admin/domains").then((r) => r.domains),
  });

export const useAdminDomain = (slug: string) =>
  useQuery({
    queryKey: ["admin", "domain", slug],
    queryFn: () => api<{ domain: DomainDetail }>(`/admin/domains/${slug}`).then((r) => r.domain),
  });

function invalidateDomains(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["domains"] });
  qc.invalidateQueries({ queryKey: ["domain"] });
  qc.invalidateQueries({ queryKey: ["admin"] });
}

export function useSaveDomain(mode: "create" | "edit") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slug: string; body: DomainConfigInput | DomainUpdateInput }) =>
      mode === "create"
        ? post<{ domain: DomainDetail }>("/admin/domains", input.body)
        : put<{ domain: DomainDetail }>(`/admin/domains/${input.slug}`, input.body),
    onSuccess: () => invalidateDomains(qc),
  });
}

export function useDeleteDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api<void>(`/admin/domains/${slug}`, { method: "DELETE" }),
    onSuccess: () => invalidateDomains(qc),
  });
}
