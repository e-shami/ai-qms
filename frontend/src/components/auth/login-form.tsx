"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Building2 } from "lucide-react";
import toast from "react-hot-toast";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loginSchema,
  verifyInstitutionSchema,
  type LoginFormValues,
  type VerifyInstitutionValues,
} from "@/lib/validators";
import { homeFor } from "@/lib/navigation";
import { lastUsedInstitution, useAuthStore } from "@/store/auth";

interface VerifiedInstitution {
  code: string;
  name: string;
  type: string | null;
  is_active: boolean;
}

export function LoginForm() {
  const login = useAuthStore((state) => state.login);
  const verifyInstitution = useAuthStore((state) => state.verifyInstitution);
  const router = useRouter();
  const [step, setStep] = useState<"code" | "credentials">("code");
  const [institution, setInstitution] = useState<VerifiedInstitution | null>(null);
  const [error, setError] = useState<string | null>(null);

  const codeForm = useForm<VerifyInstitutionValues>({
    resolver: zodResolver(verifyInstitutionSchema),
    defaultValues: { code: "" },
  });

  const credentialForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { code: "", email: "", password: "" },
  });

  // Prefill the last institution this browser signed in to.
  useEffect(() => {
    const previous = lastUsedInstitution();
    if (previous) codeForm.setValue("code", previous);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onVerifyCode(values: VerifyInstitutionValues) {
    setError(null);
    try {
      const info = await verifyInstitution(values.code);
      setInstitution({ ...info, code: values.code.toUpperCase() });
      credentialForm.setValue("code", values.code.toUpperCase());
      if (info.is_active) setStep("credentials");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      setError(message);
      toast.error(message);
    }
  }

  async function onSignIn(values: LoginFormValues) {
    setError(null);
    try {
      await login(values.code, values.email, values.password);
      toast.success("Welcome back!");
      router.push(homeFor(useAuthStore.getState().user?.role));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      {step === "code" ? (
        <>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Start with your institution ID — every workspace has its own.
            </CardDescription>
          </CardHeader>
          <form onSubmit={codeForm.handleSubmit(onVerifyCode)} noValidate>
            <CardContent className="space-y-4">
              {error && <Alert variant="destructive">{error}</Alert>}
              <div className="space-y-2">
                <Label htmlFor="institution-code">Institution ID</Label>
                <Input
                  id="institution-code"
                  placeholder="SHR016"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="font-mono uppercase"
                  aria-invalid={!!codeForm.formState.errors.code}
                  {...codeForm.register("code")}
                />
                {codeForm.formState.errors.code && (
                  <p className="text-xs text-destructive">
                    {codeForm.formState.errors.code.message}
                  </p>
                )}
              </div>
              {institution && !institution.is_active && (
                <Alert>
                  {institution.name} is not accepting sign-ins right now.
                </Alert>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full"
                disabled={codeForm.formState.isSubmitting}
              >
                {codeForm.formState.isSubmitting ? "Checking…" : "Continue"}
                {!codeForm.formState.isSubmitting && <ArrowRight />}
              </Button>
              <p className="text-sm text-muted-foreground">
                New institution?{" "}
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href="/register"
                >
                  Create an account
                </Link>
              </p>
            </CardFooter>
          </form>
        </>
      ) : (
        <>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium leading-tight">
                    {institution?.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[institution?.type, institution?.code]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setStep("code");
                  setInstitution(null);
                  setError(null);
                }}
              >
                Change
              </Button>
            </div>
          </CardHeader>
          <form onSubmit={credentialForm.handleSubmit(onSignIn)} noValidate>
            <CardContent className="space-y-4">
              {error && <Alert variant="destructive">{error}</Alert>}
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!credentialForm.formState.errors.email}
                  {...credentialForm.register("email")}
                />
                {credentialForm.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {credentialForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!credentialForm.formState.errors.password}
                  {...credentialForm.register("password")}
                />
                {credentialForm.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {credentialForm.formState.errors.password.message}
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full"
                disabled={credentialForm.formState.isSubmitting}
              >
                {credentialForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-sm text-muted-foreground">
                New institution?{" "}
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href="/register"
                >
                  Create an account
                </Link>
              </p>
            </CardFooter>
          </form>
        </>
      )}
    </Card>
  );
}
