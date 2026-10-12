import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

/**
 * Persistent, unskippable safety disclaimer. Renders on every AI-adjacent
 * and app surface. Crisis resources are never gated.
 */
export function SafetyFooter() {
  const { t } = useTranslation();
  return (
    <div className="border-t border-border bg-muted/60 px-4 py-3 text-center text-sm text-muted-foreground">
      <p className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span>{t("safety.disclaimer")}</span>
        <Link to="/chat" search={{ support: true }} className="font-semibold text-primary underline underline-offset-4">
          {t("safety.getCrisisSupport")}
        </Link>
      </p>
    </div>
  );
}
