// "Connect me to a person" — lives inside the chat screen as a slide-over.
// The member sees the state of their request and can write to whoever picks it
// up; replies from the team also appear in the chat transcript itself.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send, UserRound, X } from "lucide-react";
import {
  getMyHumanSupport,
  replyToMyHumanSupport,
  requestHumanSupport,
} from "@/lib/human-handoff.functions";
import { useTranslation } from "@/lib/i18n";

export function HumanSupportPanel({
  threadId,
  onClose,
}: {
  threadId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fetchRequest = useServerFn(getMyHumanSupport);
  const createRequest = useServerFn(requestHumanSupport);
  const sendReply = useServerFn(replyToMyHumanSupport);
  const [text, setText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["my-human-support"],
    queryFn: () => fetchRequest(),
    // A person may pick this up while the panel is open.
    refetchInterval: 20_000,
  });

  const request = data?.request ?? null;
  const active = request && request.status !== "closed" ? request : null;

  const ask = useMutation({
    mutationFn: () => createRequest({ data: { thread_id: threadId ?? null } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-human-support"] });
      toast.success(t("humanSupport.requested"));
    },
    onError: () => toast.error(t("humanSupport.requestFailed")),
  });

  const reply = useMutation({
    mutationFn: (content: string) =>
      sendReply({ data: { request_id: active?.id as string, content } }),
    onMutate: () => setText(""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-human-support"] });
    },
    onError: (_error, content) => {
      setText((current) => current || content);
      toast.error(t("humanSupport.requestFailed"));
    },
  });

  const statusLabel = active
    ? active.status === "claimed"
      ? t("humanSupport.statusClaimedAnon")
      : t("humanSupport.statusQueued")
    : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20 backdrop-blur-sm">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <aside className="flex h-full w-full max-w-md flex-col border-s border-border bg-background shadow-xl">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 font-display text-lg">
              <UserRound className="size-4 text-primary" aria-hidden />
              {t("humanSupport.title")}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("humanSupport.intro")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {isLoading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          )}

          {!isLoading && !active && (
            <button
              type="button"
              onClick={() => ask.mutate()}
              disabled={ask.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {ask.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {ask.isPending ? t("humanSupport.requesting") : t("humanSupport.request")}
            </button>
          )}

          {active && (
            <>
              <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                {statusLabel}
              </p>

              {active.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("humanSupport.noMessages")}</p>
              ) : (
                <ul className="space-y-3">
                  {active.messages.map((message) => (
                    <li key={message.id} className="space-y-1">
                      <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                        {message.sender === "user"
                          ? t("humanSupport.youLabel")
                          : t("humanSupport.teamLabel")}
                      </p>
                      <p
                        className={`whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          message.sender === "user"
                            ? "bg-secondary text-secondary-foreground"
                            : "border border-border bg-card"
                        }`}
                      >
                        {message.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {request && request.status === "closed" && (
            <p className="text-xs text-muted-foreground">{t("humanSupport.statusClosed")}</p>
          )}
        </div>

        {active && (
          <footer className="flex items-end gap-2 border-t border-border px-5 py-4">
            <textarea
              rows={2}
              maxLength={2000}
              value={text}
              placeholder={t("humanSupport.replyPlaceholder")}
              onChange={(event) => setText(event.target.value)}
              className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            <button
              type="button"
              aria-label={t("humanSupport.send")}
              disabled={!text.trim() || reply.isPending}
              onClick={() => reply.mutate(text.trim())}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="size-4" aria-hidden />
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}
