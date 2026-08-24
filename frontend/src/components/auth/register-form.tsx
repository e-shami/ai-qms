"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy } from "lucide-react";
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
import { useAuthStore } from "@/store/auth";
import { registerSchema, type RegisterFormValues } from "@/lib/validators";
import { homeFor } from "@/lib/navigation";

export function RegisterForm() {
  const registerAccount = useAuthStore((state) => state.register);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Set once registration lands; swaps the form for the code reveal.
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      institutionName: "",
      institutionType: "hospital",
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function onCopyCode() {
    if (!createdCode) return;
    try {
      await navigator.clipboard.writeText(createdCode);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the code stays visible to copy by hand.
    }
  }

  async function onSubmit(values: RegisterFormValues) {
    setError(null);
    try {
      const result = await registerAccount({
        email: values.email,
        password: values.password,
        full_name: values.fullName,
        institution_name: values.institutionName,
        institution_type: values.institutionType || undefined,
      });
      setCreatedCode(result.institutionCode);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      toast.error(message);
    }
  }

  if (createdCode) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Institution created</CardTitle>
          <CardDescription>
            This ID is how you and your staff sign in. Keep it handy — it also
            appears in Settings at any time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            <span
              className="font-mono text-2xl font-semibold tracking-widest"
              aria-label={`Institution ID ${createdCode}`}
            >
              {createdCode}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onCopyCode}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            onClick={() => router.push(homeFor(useAuthStore.getState().user?.role))}
          >
            Continue to dashboard
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create your institution</CardTitle>
        <CardDescription>
          Register as admin — a new institution workspace is created for you.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="fullName">Your name</Label>
            <Input id="fullName" aria-invalid={!!errors.fullName} {...register("fullName")} />
            {errors.fullName && (
              <p className="text-xs text-destructive">{errors.fullName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="institutionName">Institution name</Label>
            <Input
              id="institutionName"
              aria-invalid={!!errors.institutionName}
              {...register("institutionName")}
            />
            {errors.institutionName && (
              <p className="text-xs text-destructive">
                {errors.institutionName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="institutionType">Institution type</Label>
            <Input
              id="institutionType"
              placeholder="e.g. hospital, bank, university"
              aria-invalid={!!errors.institutionType}
              {...register("institutionType")}
            />
            {errors.institutionType && (
              <p className="text-xs text-destructive">
                {errors.institutionType.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create workspace"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              href="/login"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
