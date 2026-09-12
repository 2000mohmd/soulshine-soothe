// "Talk to a person" — a dedicated pane inside the chat screen itself (a mode
// switch, not an overlay), so the whole conversation with the support team
// reads like part of the same chat rather than a separate floating widget.
// Replies from the team also get mirrored into the AI transcript itself
// (see admin-handoff.functions.ts), clearly labelled, so nothing is missed
// if the member switches back before they've read it here.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Send, UserRound } from "lucide-react";
import {
  getMyHumanSupport,
  replyToMyHumanSupport,
  requestHumanSupport,
} from "@/lib/human-handoff.functions";
import { useTranslation } from "@/lib/i18n";

export function HumanSupportPanel({
  threadId,
  onBack,
}: {
  threadId: string | null;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fetchRequest = useServerFn(getMyHumanSupport);
  const createRequest = useServerFn(requestHumanSupport);
  const sendReply = useServerFn(replyToMyHumanSupport);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-human-support"],
    queryFn: () => fetchRequest(),
    // A person may pick this up while the pane is open.
    refetchInterval: 20_000,
  });

  const request = data?.request ?? null;
  const active = request && request.status !== "closed" ? request : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length]);

  const ask = useMutation({
    mutationFn: () => createRequest({ data: { thread_id: threadId ?? null } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-human-support"] });
      toast.success(t("humanSupport.requested"));
    },
    onError: () => toast.error(t("humanSupport.requestFailed")),
  });

  const reply = useMutation({
    mutationFn: (message: string) =>
      sendReply({ data: { request_id: active?.id as string, message } }),
    onMutate: () => setText(""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-human-support"] });
    },
    onError: (_error, message) => {
      setText((current) => current || message);
      toast.error(t("humanSupport.requestFailed"));
    },
  });

  const statusLabel = active
    ? active.status === "claimed"
      ? t("humanSupport.statusClaimedAnon")
      : t("humanSupport.statusQueued")
    : null;

  function submit() {
    const value = text.trim();
    if (!value || reply.isPending) return;
    reply.mutate(value);
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("humanSupport.backToChat")}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </button>
        <h1 className="flex min-w-0 flex-1 items-center gap-2 truncate font-display text-base">
          <UserRound className="size-4 text-primary" aria-hidden />
          {t("humanSupport.title")}
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="mx-auto w-full max-w-2xl space-y-4 py-6">
          <p className="text-sm text-muted-foreground">{t("humanSupport.intro")}</p>

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
                <ul className="space-y-4">
                  {active.messages.map((message) => (
                    <li
                      key={message.id}
                      className={message.sender === "user" ? "flex justify-end" : "space-y-1"}
                    >
                      {message.sender === "user" ? (
                        <p className="max-w-[85%] whitespace-pre-line rounded-2xl bg-secondary px-4 py-2.5 text-sm leading-relaxed text-secondary-foreground">
                          {message.content}
                        </p>
                      ) : (
                        <div className="flex gap-3">
                          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12">
                            <UserRound className="size-3.5 text-primary" aria-hidden />
                          </span>
                          <p className="min-w-0 flex-1 whitespace-pre-line text-[0.95rem] leading-7">
                            {message.content}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {request && request.status === "closed" && (
            <p className="text-xs text-muted-foreground">{t("humanSupport.statusClosed")}</p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {active && (
        <div className="shrink-0 px-4 pb-3">
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-end gap-2 rounded-3xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/40">
              <textarea
                rows={2}
                maxLength={2000}
                value={text}
                placeholder={t("humanSupport.replyPlaceholder")}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                className="min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                aria-label={t("humanSupport.send")}
                disabled={!text.trim() || reply.isPending}
                onClick={submit}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              >
                <Send className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
