import { useMutation } from "@connectrpc/connect-query";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { requestPasswordReset } from "@/gen/zerx/v1/auth-AuthService_connectquery";
import { firstErrorMessage } from "@/lib/form";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useI18n();
  const mutation = useMutation(requestPasswordReset);
  const [sent, setSent] = useState(false);

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync({ email: value.email });
      } catch {
        // Always show success to prevent email enumeration
      }
      setSent(true);
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
          <CardTitle className="text-xl">{t("passwordReset.forgotTitle")}</CardTitle>
          <CardDescription>{t("passwordReset.forgotSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t("passwordReset.forgotSuccess")}</p>
              <Link to="/login" className="text-sm font-medium text-primary hover:underline">
                {t("passwordReset.backToLogin")}
              </Link>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
              }}
            >
              <form.Field
                name="email"
                validators={{ onChange: z.email(t("validation.email")) }}
              >
                {(field) => {
                  const error = firstErrorMessage(field.state.meta.errors);
                  return (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={field.name}>{t("common.email")}</Label>
                      <Input
                        id={field.name}
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
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
                  ? t("passwordReset.forgotSubmitting")
                  : t("passwordReset.forgotSubmit")}
              </Button>

              <p className="text-center text-sm">
                <Link to="/login" className="font-medium text-primary hover:underline">
                  {t("passwordReset.backToLogin")}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
