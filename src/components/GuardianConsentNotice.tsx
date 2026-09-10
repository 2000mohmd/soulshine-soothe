// Shown at the top of the chat screen for a 13-17 member whose guardian hasn't
// approved yet. Crisis help is never hidden behind this — only the companion.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldQuestion } from "lucide-react";
import {
  getMyGuardianConsent,
  requestGuardianConsent,
} from "@/lib/guardian-consent.functions";
import { useTranslation } from "@/lib/i18n";

export function GuardianConsentNotice() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fetchConsent = useServerFn(getMyGuardianConsent);
  const requestConsent = useServerFn(requestGuardianConsent);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const { data } = useQuery({
    queryKey: ["guardian-consent"],
    queryFn: () => fetchConsent(),
    refetchInterval: 30_000,
  });

  const send = useMutation({
    mutationFn: () =>
      requestConsent({
        data: { guardian_email: email.trim(), guardian_name: name.trim() || null },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["guardian-consent"] });
    },
    onError: () => toast.error(t("guardian.sendFailed")),
  });

  if (!data?.required || data.status === "granted") return null;

  const pending = data.status === "pending" && data.guardian_email;

  return (
    <div className="mx-auto mt-4 w-full max-w-2xl rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldQuestion className="size-4 text-primary" aria-hidden />
        {t("guardian.title")}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("guardian.body")}</p>

      {data.status === "withdrawn" && (
        <p className="mt-2 text-xs text-muted-foreground">{t("guardian.withdrawn")}</p>
      )}

      {pending && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("guardian.sentTo", { email: data.guardian_email as string })}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          placeholder={t("guardian.emailLabel")}
          onChange={(event) => setEmail(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        <input
          value={name}
          placeholder={t("guardian.nameLabel")}
          onChange={(event) => setName(event.target.value)}
          className="min-w-0 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50 sm:w-36"
        />
        <button
          type="button"
          onClick={() => send.mutate()}
          disabled={!email.includes("@") || send.isPending}
          className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {send.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {send.isPending
            ? t("guardian.sending")
            : pending
              ? t("guardian.resend")
              : t("guardian.send")}
        </button>
      </div>
    </div>
  );
}
