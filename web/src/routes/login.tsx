import { ConnectError } from "@connectrpc/connect";
import { useMutation } from "@connectrpc/connect-query";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/gen/zerx/v1/auth-AuthService_connectquery";
import { auth } from "@/lib/auth";
import { firstErrorMessage } from "@/lib/form";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const search = Route.useSearch();
  const loginMutation = useMutation(login);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onChange: loginSchema },
    onSubmit: async ({ value }) => {
      try {
        const res = await loginMutation.mutateAsync(value);
        auth.setTokens(res.accessToken, res.refreshToken);
        router.history.push(search.redirect ?? "/dashboard");
      } catch (err) {
        toast.error(err instanceof ConnectError ? err.message : "Login failed");
      }
    },
  });

  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>zerxLabKit</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field name="email">
              {(field) => {
                const error = firstErrorMessage(field.state.meta.errors);
                return (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={field.name}>Email</Label>
                    <Input
                      id={field.name}
                      type="email"
                      autoComplete="username"
                      placeholder="admin@example.com"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {error && <p className="text-destructive text-sm">{error}</p>}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="password">
              {(field) => {
                const error = firstErrorMessage(field.state.meta.errors);
                return (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={field.name}>Password</Label>
                    <Input
                      id={field.name}
                      type="password"
                      autoComplete="current-password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {error && <p className="text-destructive text-sm">{error}</p>}
                  </div>
                );
              }}
            </form.Field>

            <Button type="submit" className="mt-2" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
