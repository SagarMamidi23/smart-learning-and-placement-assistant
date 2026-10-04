"use client";

import { useQuery } from "@tanstack/react-query";
import type { AnalyticsDto } from "@slp/shared";
import { api } from "./api";

export const useAnalytics = (days: number) =>
  useQuery({
    queryKey: ["admin", "analytics", days],
    queryFn: () =>
      api<{ analytics: AnalyticsDto }>(`/admin/analytics?days=${days}`).then((r) => r.analytics),
    staleTime: 30_000,
  });
