"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReadinessHistoryPoint, ReadinessResultDto } from "@slp/shared";
import { ApiError, api, post } from "./api";

export const useReadiness = (enabled = true) =>
  useQuery({
    queryKey: ["readiness", "latest"],
    enabled,
    queryFn: () =>
      api<{ result: ReadinessResultDto }>("/readiness/latest")
        .then((r) => r.result)
        .catch((e) => {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }),
  });

export const useReadinessHistory = (enabled = true) =>
  useQuery({
    queryKey: ["readiness", "history"],
    enabled,
    queryFn: () =>
      api<{ target: number | null; points: ReadinessHistoryPoint[] }>("/readiness/history"),
  });

export function useComputeReadiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      post<{ result: ReadinessResultDto }>("/readiness/compute").then((r) => r.result),
    onSuccess: (result) => {
      qc.setQueryData(["readiness", "latest"], result);
      qc.invalidateQueries({ queryKey: ["readiness", "history"] });
    },
  });
}
