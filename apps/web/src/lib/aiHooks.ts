"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DiscoveryResultDto,
  GeneratePathInput,
  GoalProgressInput,
  LearningPathDto,
  QuizDefinition,
  SkillGapDto,
} from "@slp/shared";
import { ApiError, api, post } from "./api";

/** A 404 means "not created yet", which the pages treat as an empty state rather than an error. */
const orNull = <T>(p: Promise<T>) =>
  p.catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });

export const useQuiz = () =>
  useQuery({
    queryKey: ["quiz"],
    queryFn: () => api<{ quiz: QuizDefinition }>("/discovery/quiz").then((r) => r.quiz),
    staleTime: Infinity,
  });

export const useDiscoveryResult = () =>
  useQuery({
    queryKey: ["discovery"],
    queryFn: () =>
      orNull(api<{ result: DiscoveryResultDto }>("/discovery/result").then((r) => r.result)),
  });

export function useSubmitQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: Record<string, string | number>) =>
      post<{ result: DiscoveryResultDto }>("/discovery/result", { answers }).then((r) => r.result),
    onSuccess: (result) => {
      qc.setQueryData(["discovery"], result);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export const useSkillGap = (enabled = true) =>
  useQuery({
    queryKey: ["skill-gap"],
    enabled,
    queryFn: () => orNull(api<{ report: SkillGapDto }>("/skill-gap/latest").then((r) => r.report)),
  });

export function useGenerateSkillGap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ report: SkillGapDto }>("/skill-gap/generate").then((r) => r.report),
    onSuccess: (report) => {
      qc.setQueryData(["skill-gap"], report);
      // Any existing plan is now out of date.
      qc.invalidateQueries({ queryKey: ["learning-path"] });
    },
  });
}

export const useLearningPath = (enabled = true) =>
  useQuery({
    queryKey: ["learning-path"],
    enabled,
    queryFn: () => orNull(api<{ path: LearningPathDto }>("/learning-path").then((r) => r.path)),
  });

export function useGeneratePath() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GeneratePathInput) =>
      post<{ path: LearningPathDto }>("/learning-path/generate", input).then((r) => r.path),
    onSuccess: (path) => qc.setQueryData(["learning-path"], path),
  });
}

/** Ticking a goal updates the checklist immediately and rolls back if the server rejects it. */
export function useToggleGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalProgressInput) =>
      api<{ path: LearningPathDto }>("/learning-path/progress", {
        method: "PATCH",
        body: JSON.stringify(input),
      }).then((r) => r.path),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["learning-path"] });
      const previous = qc.getQueryData<LearningPathDto | null>(["learning-path"]);
      if (previous) {
        qc.setQueryData<LearningPathDto>(["learning-path"], {
          ...previous,
          weeks: previous.weeks.map((w) =>
            w.week === input.week
              ? {
                  ...w,
                  goals: w.goals.map((g, i) =>
                    i === input.goalIndex ? { ...g, done: input.done } : g,
                  ),
                }
              : w,
          ),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(["learning-path"], ctx?.previous),
    onSuccess: (path) => qc.setQueryData(["learning-path"], path),
  });
}
