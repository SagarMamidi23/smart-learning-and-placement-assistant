"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssessmentContent,
  AssessmentSummaryDto,
  AttemptDto,
  FeaturesDto,
  GenerateAssessmentInput,
  MockEvalDto,
  Question,
  SubmitAttemptInput,
} from "@slp/shared";
import { api, post, put } from "./api";

export const useFeatures = () =>
  useQuery({
    queryKey: ["features"],
    queryFn: () => api<{ features: FeaturesDto }>("/features").then((r) => r.features),
    staleTime: 10 * 60_000,
  });

// ---- student assessments ----

export const useAssessments = (enabled = true) =>
  useQuery({
    queryKey: ["assessments"],
    enabled,
    queryFn: () =>
      api<{ assessments: AssessmentSummaryDto[] }>("/assessments").then((r) => r.assessments),
  });

export interface AttemptSummary {
  id: string;
  assessmentId: string;
  title: string;
  score: number;
  timeTakenSec?: number;
  submittedAt: string;
}

export const useAttemptHistory = () =>
  useQuery({
    queryKey: ["assessments", "attempts"],
    queryFn: () =>
      api<{ attempts: AttemptSummary[] }>("/assessments/attempts").then((r) => r.attempts),
  });

export const useStartAttempt = () =>
  useMutation({
    mutationFn: (assessmentId: string) =>
      post<{ attempt: AttemptDto }>(`/assessments/${assessmentId}/start`).then((r) => r.attempt),
  });

export function useSubmitAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { attemptId: string } & SubmitAttemptInput) =>
      post<{ attempt: AttemptDto }>(`/assessments/attempts/${input.attemptId}/submit`, {
        answers: input.answers,
      }).then((r) => r.attempt),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessments"] }),
  });
}

// ---- admin assessments ----

export interface AdminAssessment extends AssessmentSummaryDto {
  questions: Question[];
  origin?: string;
  llm?: string;
  groundedOn: string[];
  reviewed: boolean;
}

export const useAdminAssessments = () =>
  useQuery({
    queryKey: ["admin", "assessments"],
    queryFn: () =>
      api<{ assessments: AssessmentSummaryDto[] }>("/admin/assessments").then((r) => r.assessments),
  });

export const useAdminAssessment = (id: string) =>
  useQuery({
    queryKey: ["admin", "assessment", id],
    queryFn: () =>
      api<{ assessment: AdminAssessment }>(`/admin/assessments/${id}`).then((r) => r.assessment),
  });

export function useGenerateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateAssessmentInput) =>
      post<{ assessment: AdminAssessment }>("/admin/assessments/generate", input).then(
        (r) => r.assessment,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "assessments"] }),
  });
}

export function useAssessmentActions(id: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "assessment", id] });
    qc.invalidateQueries({ queryKey: ["admin", "assessments"] });
  };
  return {
    save: useMutation({
      mutationFn: (content: AssessmentContent) =>
        put<{ assessment: AdminAssessment }>(`/admin/assessments/${id}`, content).then(
          (r) => r.assessment,
        ),
      onSuccess: refresh,
    }),
    publish: useMutation({
      mutationFn: () => post<{ assessment: AdminAssessment }>(`/admin/assessments/${id}/publish`),
      onSuccess: refresh,
    }),
    unpublish: useMutation({
      mutationFn: () => post<{ assessment: AdminAssessment }>(`/admin/assessments/${id}/unpublish`),
      onSuccess: refresh,
    }),
    duplicate: useMutation({
      mutationFn: () =>
        post<{ assessment: AdminAssessment }>(`/admin/assessments/${id}/duplicate`).then(
          (r) => r.assessment,
        ),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: () => api<void>(`/admin/assessments/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
  };
}

// ---- mock evaluation ----

export interface MockEvalSummary {
  id: string;
  type: "interview" | "practical-task";
  status: "in-progress" | "completed";
  overallScore?: number;
  createdAt: string;
}

export const useMockEvals = (enabled = true) =>
  useQuery({
    queryKey: ["mock-eval"],
    enabled,
    queryFn: () => api<{ evaluations: MockEvalSummary[] }>("/mock-eval").then((r) => r.evaluations),
  });

export const useMockEval = (id: string) =>
  useQuery({
    queryKey: ["mock-eval", id],
    queryFn: () => api<{ evaluation: MockEvalDto }>(`/mock-eval/${id}`).then((r) => r.evaluation),
  });

export function useStartMockEval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questionCount: number) =>
      post<{ evaluation: MockEvalDto }>("/mock-eval/start", { questionCount }).then(
        (r) => r.evaluation,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mock-eval"] }),
  });
}

export function useSubmitMockEval(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: { questionId: string; text: string }[]) =>
      post<{ evaluation: MockEvalDto }>(`/mock-eval/${id}/submit`, { answers }).then(
        (r) => r.evaluation,
      ),
    onSuccess: (evaluation) => {
      qc.setQueryData(["mock-eval", id], evaluation);
      qc.invalidateQueries({ queryKey: ["mock-eval"] });
    },
  });
}
