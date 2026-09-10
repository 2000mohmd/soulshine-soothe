// The 24/7 human support desk: requests members raised from chat, with the
// AI's handover note, claim/close controls, and replies that land back in the
// member's chat clearly labelled as a person.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  claimHumanSupportRequest,
  closeHumanSupportRequest,
  getHumanSupportRequest,
  listHumanSupportRequests,
  replyToHumanSupportRequest,
} from "@/lib/admin-handoff.functions";

export const Route = createFileRoute("/_authenticated/admin/human")({
  component: HumanSupportDesk,
});

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/15 text-destructive",
  moderate: "bg-secondary text-secondary-foreground",
};

function HumanSupportDesk() {
  const queryClient = useQueryClient();
  const fetchQueue = useServerFn(listHumanSupportRequests);
  const fetchDetail = useServerFn(getHumanSupportRequest);
  const claim = useServerFn(claimHumanSupportRequest);
  const close = useServerFn(closeHumanSupportRequest);
  const reply = useServerFn(replyToHumanSupportRequest);

  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const queue = useQuery({
    queryKey: ["admin-human-queue"],
    queryFn: () => fetchQueue(),
    refetchInterval: 30_000,
  });

  const detail = useQuery({
    queryKey: ["admin-human-request", selected],
    queryFn: () => fetchDetail({ data: { request_id: selected as string } }),
    enabled: Boolean(selected),
    refetchInterval: 20_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-human-queue"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-human-request", selected] }),
    ]);
  };

  const claimIt = useMutation({
    mutationFn: (id: string) => claim({ data: { request_id: id } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const closeIt = useMutation({
    mutationFn: (id: string) => close({ data: { request_id: id } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const send = useMutation({
    mutationFn: (text: string) =>
      reply({ data: { request_id: selected as string, message: text } }),
    onMutate: () => setMessage(""),
    onSuccess: refresh,
    onError: (error: Error, text) => {
      setMessage((current) => current || text);
      toast.error(error.message);
    },
  });

  const requests = queue.data?.requests ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <section className="space-y-2">
        <h2 className="font-display text-lg">
          Human support
          {queue.data?.waiting ? (
            <span className="ms-2 rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
              {queue.data.waiting} waiting
            </span>
          ) : null}
        </h2>

        {queue.isLoading && <Skeleton className="h-24 w-full rounded-2xl" />}
        {!queue.isLoading && requests.length === 0 && (
          <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No requests yet.
          </p>
        )}

        <ul className="space-y-2">
          {requests.map((request) => (
            <li key={request.id}>
              <button
                type="button"
                onClick={() => setSelected(request.id)}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                  selected === request.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {request.preferred_name ?? "Member"}
                  </span>
                  {request.severity && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] uppercase ${
                        SEVERITY_STYLE[request.severity] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {request.severity}
                    </span>
                  )}
                  <span className="ms-auto text-[0.7rem] text-muted-foreground">
                    {request.status}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {request.last_message ?? request.summary ?? "No summary available."}
                </p>
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  {new Date(request.created_at).toLocaleString()} · {request.language}
                  {request.timezone ? ` · ${request.timezone}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        {!selected && (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Select a request to read the handover note and reply.
          </p>
        )}

        {selected && detail.isLoading && <Skeleton className="h-64 w-full rounded-2xl" />}

        {selected && detail.data && (
          <>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg">
                  {detail.data.request.preferred_name ?? "Member"}
                </h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground">
                  {detail.data.request.status}
                </span>
                <div className="ms-auto flex gap-2">
                  {detail.data.request.status === "queued" && (
                    <Button
                      size="sm"
                      onClick={() => claimIt.mutate(detail.data.request.id)}
                      disabled={claimIt.isPending}
                    >
                      Claim
                    </Button>
                  )}
                  {detail.data.request.status !== "closed" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => closeIt.mutate(detail.data.request.id)}
                      disabled={closeIt.isPending}
                    >
                      Close
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
                {detail.data.request.summary ?? "No handover note was generated."}
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
              {detail.data.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                <ul className="space-y-3">
                  {detail.data.messages.map((entry) => (
                    <li key={entry.id} className="space-y-1">
                      <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                        {entry.sender === "user" ? "Member" : "Support"}
                      </p>
                      <p
                        className={`whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          entry.sender === "user" ? "bg-muted" : "bg-secondary"
                        }`}
                      >
                        {entry.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-end gap-2 border-t border-border pt-3">
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={message}
                  placeholder="Write to this person — they see it in their chat, labelled as a human."
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
                <Button
                  onClick={() => send.mutate(message.trim())}
                  disabled={message.trim().length < 2 || send.isPending}
                >
                  {send.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
