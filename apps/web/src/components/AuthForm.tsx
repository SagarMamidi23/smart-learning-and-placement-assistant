"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginSchema, registerSchema } from "@slp/shared";
import { ApiError } from "@/lib/api";
import { useAuthMutation } from "@/lib/hooks";
import { ErrorAlert, Field, primaryButton } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const mutation = useAuthMutation(mode);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const isRegister = mode === "register";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(undefined);
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = (isRegister ? registerSchema : loginSchema).safeParse(data);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors))
        errs[k] = v?.[0] ?? "";
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    try {
      await mutation.mutateAsync(parsed.data);
      router.push("/dashboard");
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-bold">{isRegister ? "Create your account" : "Sign in"}</h1>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        {isRegister && (
          <Field id="name" name="name" label="Name" autoComplete="name" error={fieldErrors.name} />
        )}
        <Field
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          error={fieldErrors.email}
        />
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          error={fieldErrors.password}
        />
        {isRegister && (
          <p className="text-sm text-slate-500">
            At least 8 characters, with a letter and a digit.
          </p>
        )}
        <ErrorAlert message={formError} />
        <button type="submit" disabled={mutation.isPending} className={`${primaryButton} w-full`}>
          {mutation.isPending ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm">
        {isRegister ? "Already have an account? " : "New here? "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="text-indigo-600 underline dark:text-indigo-400"
        >
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </main>
  );
}
