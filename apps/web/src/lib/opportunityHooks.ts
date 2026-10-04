"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AlertDto,
  ApplicationDto,
  ApplicationStatus,
  MatchesResponse,
  OpportunityDto,
  OpportunityInput,
} from "@slp/shared";
import { api, post, put } from "./api";

export const useOpportunities = (filters: { type?: string; q?: string }, enabled = true) =>
  useQuery({
    queryKey: ["opportunities", filters],
    enabled,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filters.type) qs.set("type", filters.type);
      if (filters.q) qs.set("q", filters.q);
      return api<{ opportunities: OpportunityDto[] }>(`/opportunities?${qs}`).then(
        (r) => r.opportunities,
      );
    },
  });

/** Uses the LLM, so it is fetched only on request and kept for the session rather than refetched on every focus. */
export const useMatches = (enabled: boolean, type?: string) =>
  useQuery({
    queryKey: ["opportunities", "matches", type ?? ""],
    enabled,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: () =>
      api<MatchesResponse>(
        `/opportunities/matches${type ? `?type=${encodeURIComponent(type)}` : ""}`,
      ),
  });

export const useApplications = (enabled = true) =>
  useQuery({
    queryKey: ["applications"],
    enabled,
    queryFn: () =>
      api<{ applications: ApplicationDto[] }>("/applications").then((r) => r.applications),
  });

export const useAlerts = (enabled = true) =>
  useQuery({
    queryKey: ["applications", "alerts"],
    enabled,
    queryFn: () => api<{ alerts: AlertDto[] }>("/applications/alerts").then((r) => r.alerts),
  });

const refresh = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["applications"] });
  qc.invalidateQueries({ queryKey: ["opportunities", "matches"] });
};

export function useTrackOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { opportunityId: string; status?: ApplicationStatus }) =>
      post<{ application: ApplicationDto }>("/applications", input).then((r) => r.application),
    onSuccess: () => refresh(qc),
  });
}

export type ApplicationPatch = Partial<{
  status: ApplicationStatus;
  notes: string;
  deadlines: { label: string; date: string }[];
}>;

export function useUpdateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ApplicationPatch }) =>
      api<{ application: ApplicationDto }>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }).then((r) => r.application),
    onSuccess: () => refresh(qc),
  });
}

export function useDeleteApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/applications/${id}`, { method: "DELETE" }),
    onSuccess: () => refresh(qc),
  });
}

// ---- admin ----

export const useAdminOpportunities = () =>
  useQuery({
    queryKey: ["admin", "opportunities"],
    queryFn: () =>
      api<{ opportunities: OpportunityDto[] }>("/admin/opportunities").then((r) => r.opportunities),
  });

export function useSaveOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: OpportunityInput }) => {
      if (id) {
        const { domain: _domain, ...update } = data;
        return put<{ opportunity: OpportunityDto }>(`/admin/opportunities/${id}`, update);
      }
      return post<{ opportunity: OpportunityDto }>("/admin/opportunities", data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "opportunities"] }),
  });
}

export function useDeleteOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/opportunities/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "opportunities"] }),
  });
}
