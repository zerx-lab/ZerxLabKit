import { ConnectError } from "@connectrpc/connect";
import { useMutation } from "@connectrpc/connect-query";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { BrandLogo } from "@/components/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { confirmPasswordReset } from "@/gen/zerx/v1/auth-AuthService_connectquery";
import { firstErrorMessage } from "@/lib/form";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === "string" ? { token: search.token } : {},
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const search = Route.useSearch();
  const token = search.token ?? "";
  const mutation = useMutation(confirmPasswordReset);
  const [done, setDone] = useState(false);

  const form = useForm({
    defaultValues: { newPassword: "" },
    validators: {
      onChange: z.object({
        newPassword: z.string().min(8, t("validation.passwordMin")),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync({ token, newPassword: value.newPassword });
        setDone(true);
        setTimeout(() => void router.navigate({ to: "/login" }), 2000);
      } catch (err) {
        toast.error(err instanceof ConnectError ? err.message : t("register.failed"));
      }
    },
  });

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2.5">
            <BrandLogo />
            <span className="text-lg font-semibold">{t("app.name")}</span>
          </div>
          <CardTitle className="text-xl">{t("passwordReset.resetTitle")}</CardTitle>
          <CardDescription>{t("passwordReset.resetSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t("passwordReset.resetSuccess")}</p>
              <Link to="/login" className="text-sm font-medium text-primary hover:underline">
                {t("passwordReset.backToLogin")}
              </Link>
            </div>
          ) : !token ? (
            <p className="text-sm text-destructive">
              {t("passwordReset.tokenLabel")}: missing
            </p>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
              }}
            >
              <form.Field name="newPassword">
                {(field) => {
                  const error = firstErrorMessage(field.state.meta.errors);
                  return (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={field.name}>{t("passwordReset.newPassword")}</Label>
                      <Input
                        id={field.name}
                        type="password"
                        autoComplete="new-password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      {error && <p className="text-destructive text-sm">{error}</p>}
                    </div>
                  );
                }}
              </form.Field>

              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending
                  ? t("passwordReset.resetSubmitting")
                  : t("passwordReset.resetSubmit")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
