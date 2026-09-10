import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KalmLogo } from "@/components/KalmLogo";
import { getMyProfile } from "@/lib/onboarding.functions";

import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUp,
  LifeBuoy,
  Loader2,
  Mic,
  PanelLeft,
  Phone,
  ShieldCheck,
  Square,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  createThread,
  deleteThread,
  getThreadHistory,
  listThreads,
  sendMessage,
} from "@/lib/chat.functions";
import { transcribeVoiceNote } from "@/lib/voice.functions";
import type { CompanionAction } from "@/lib/companion-tools.server";
import { crisisCopy } from "@/lib/crisis";
import { QUICK_ACTIONS } from "@/lib/quick-actions";
import { DailyPromptCard } from "@/components/DailyPromptCard";
import { InlineExerciseWidget } from "@/components/InlineExerciseWidget";
import { AppSidebar } from "@/components/AppSidebar";
import { VoiceCallOverlay } from "@/components/VoiceCallOverlay";
import { SafetyPlanPanel } from "@/components/SafetyPlanPanel";
import { HumanSupportPanel } from "@/components/HumanSupportPanel";
import { GuardianConsentNotice } from "@/components/GuardianConsentNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Talk it through — Kalm companion" },
      {
        name: "description",
        content:
          "A warm AI companion that remembers your introduction, goals and recent check-ins — with crisis support built in.",
      },
      { property: "og:title", content: "Talk it through — Kalm companion" },
      {
        property: "og:description",
        content:
          "A warm AI companion that remembers your introduction, goals and recent check-ins — with crisis support built in.",
      },
    ],
  }),
  component: ChatPage,
});

function CrisisCard({
  onOpenPlan,
  onAskHuman,
}: {
  onOpenPlan?: () => void;
  onAskHuman?: () => void;
}) {
  const { t, language } = useTranslation();
  const copy = crisisCopy(language);
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
      <p className="flex items-center gap-2 font-semibold">
        <LifeBuoy className="size-4" aria-hidden /> {t("chat.immediateSupport")}
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {copy.resources.map((resource) => (
          <li key={resource.name}>
            <span className="font-medium">{resource.name}</span> — {resource.contact}
            <span className="block text-xs text-muted-foreground">{resource.detail}</span>
          </li>
        ))}
      </ul>
      {(onOpenPlan || onAskHuman) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {onOpenPlan && (
            <button
              type="button"
              onClick={onOpenPlan}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
            >
              <ShieldCheck className="size-3.5" aria-hidden />
              {t("safetyPlan.open")}
            </button>
          )}
          {onAskHuman && (
            <button
              type="button"
              onClick={onAskHuman}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground"
            >
              <UserRound className="size-3.5" aria-hidden />
              {t("humanSupport.button")}
            </button>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{copy.disclaimer}</p>
    </div>
  );
}

/** Encodes decoded PCM audio as a 16-bit mono WAV blob (16 kHz). */
function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Microphone capture → mono WAV base64, so any provider can transcribe it. */
function useVoiceRecorder(onReady: (audio: string, mime: string) => void) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size === 0) return;
        const buffer = await blob.arrayBuffer();
        try {
          const context = new AudioContext({ sampleRate: 16000 });
          const decoded = await context.decodeAudioData(buffer.slice(0));
          const mono = decoded.getChannelData(0);
          await context.close();
          onReady(toBase64(encodeWav(mono, decoded.sampleRate)), "audio/wav");
        } catch {
          // Decoding failed (rare) — send the raw recording instead.
          onReady(
            toBase64(new Uint8Array(buffer)),
            recorder.mimeType.split(";")[0] ?? "audio/webm",
          );
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error(t("chat.micBlocked"));
    }
  }, [onReady, t]);

  return { recording, start, stop };
}

function ChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchThreads = useServerFn(listThreads);
  const fetchHistory = useServerFn(getThreadHistory);
  const newThread = useServerFn(createThread);
  const removeThread = useServerFn(deleteThread);
  const send = useServerFn(sendMessage);
  const transcribe = useServerFn(transcribeVoiceNote);

  const [threadId, setThreadId] = useState<string | null>(null);
  const [quickAction, setQuickAction] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [actions, setActions] = useState<CompanionAction[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [callOpen, setCallOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [humanOpen, setHumanOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Chat is the default authenticated landing page, so it also carries the
  // onboarding guard the old dashboard landing had.
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });

  useEffect(() => {
    if (profileData && !profileData.profile?.onboarding_completed) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [profileData, navigate]);

  const { data: threads } = useQuery({ queryKey: ["chat-threads"], queryFn: () => fetchThreads() });

  const { data: history } = useQuery({
    queryKey: ["chat-thread", threadId],
    queryFn: () => fetchHistory({ data: { thread_id: threadId as string } }),
    enabled: Boolean(threadId),
  });

  useEffect(() => {
    const first = threads?.[0];
    if (!threadId && first) setThreadId(first.id);
  }, [threadId, threads]);

  const messages = history?.messages ?? [];
  const activeThread = (threads ?? []).find((thread) => thread.id === threadId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending]);

  const mutation = useMutation({
    mutationFn: (text: string) =>
      send({
        data: {
          ...(threadId ? { thread_id: threadId } : {}),
          content: text,
          quick_action: quickAction,
        },
      }),
    // Show the sent message immediately; the box is cleared before the request.
    onMutate: (text: string) => {
      setPending(text);
      setInput("");
    },
    onSuccess: async (result) => {
      setActions(result.reply.type === "message" ? result.reply.actions : []);
      setQuickAction(null);
      setThreadId(result.thread_id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat-threads"] }),
        queryClient.invalidateQueries({ queryKey: ["chat-thread", result.thread_id] }),
      ]);
      setPending(null);
    },
    onError: (error: Error, text) => {
      setPending(null);
      setInput((current) => current || text);
      toast.error(error.message || t("chat.replyFailed"));
    },
  });

  const voice = useMutation({
    mutationFn: (payload: { audio: string; mime: string }) =>
      transcribe({ data: { audio_base64: payload.audio, mime_type: payload.mime } }),
    onSuccess: (result) => {
      mutation.mutate(result.text);
    },
    onError: (error: Error) => toast.error(error.message || t("chat.transcribeFailed")),
  });

  const recorder = useVoiceRecorder((audio, mime) => voice.mutate({ audio, mime }));

  const start = useMutation({
    mutationFn: () => newThread(),
    onSuccess: async (thread) => {
      setThreadId(thread.id);
      setActions([]);
      await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });

  const drop = useMutation({
    mutationFn: (id: string) => removeThread({ data: { thread_id: id } }),
    onSuccess: async () => {
      setThreadId(null);
      await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      toast.success(t("chat.conversationDeleted"));
    },
  });

  function submit(text: string) {
    const value = text.trim();
    if (!value || mutation.isPending) return;
    setQuickAction(null);
    mutation.mutate(value);
  }

  const busy = mutation.isPending || voice.isPending;
  const empty = messages.length === 0;
  const preferredName = profileData?.profile?.preferred_name;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((open) => !open)}
        onNewChat={() => start.mutate()}
        newChatDisabled={start.isPending}
        recents={
          <ul className="space-y-0.5">
            {(threads ?? []).map((thread) => (
              <li key={thread.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setThreadId(thread.id)}
                  className={`flex-1 truncate rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    threadId === thread.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  {thread.title}
                </button>
                <button
                  type="button"
                  aria-label={t("chat.deleteConversation")}
                  onClick={() => drop.mutate(thread.id)}
                  className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        }
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {/* Thread header, mirroring Claude's title bar. */}
        <header className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? t("chat.hideConversations") : t("chat.showConversations")}
            className={`rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground ${
              sidebarOpen ? "md:hidden" : ""
            }`}
          >
            <PanelLeft className="size-4" aria-hidden />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-display text-base">
            {activeThread?.title ?? t("nav.newConversation")}
          </h1>
          <button
            type="button"
            onClick={() => setPlanOpen(true)}
            aria-label={t("safetyPlan.open")}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            <span className="hidden lg:inline">{t("safetyPlan.open")}</span>
          </button>
          <button
            type="button"
            onClick={() => setHumanOpen(true)}
            aria-label={t("humanSupport.button")}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <UserRound className="size-3.5" aria-hidden />
            <span className="hidden lg:inline">{t("humanSupport.button")}</span>
          </button>
          <button
            type="button"
            onClick={() => setCallOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Phone className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{t("call.start")}</span>
          </button>
        </header>

        {/* Transcript: assistant text sits plain on the page, user text in a soft bubble. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <div className="mx-auto w-full max-w-2xl space-y-7 py-6">
            {empty && (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary">
                  <KalmLogo className="size-6 text-primary" aria-hidden />
                </span>
                {profileLoading ? (
                  <Skeleton className="h-9 w-52 rounded-lg" />
                ) : (
                  <h2 className="font-display text-3xl">
                    {preferredName
                      ? t("chat.greetingNamed", { name: preferredName })
                      : t("chat.greeting")}
                  </h2>
                )}
                <p className="max-w-sm text-sm text-muted-foreground">{t("chat.emptyPrompt")}</p>
                <div className="w-full max-w-md pt-4 text-left">
                  <DailyPromptCard />
                </div>
              </div>
            )}

            {messages.map((message) =>
              message.content_type === "exercise_widget" ? (
                <div key={message.id} className="ml-10">
                  <InlineExerciseWidget slug={message.exercise_slug ?? ""} threadId={threadId} />
                </div>
              ) : message.content_type === "activity" ? (
                <div
                  key={message.id}
                  className="mx-auto w-fit rounded-full border border-border bg-muted/50 px-3.5 py-1.5 text-xs text-muted-foreground"
                >
                  {message.content}
                </div>
              ) : message.sender === "system" ? (
                <div key={message.id} className="space-y-3">
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  <CrisisCard />
                </div>
              ) : message.sender === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-line rounded-2xl bg-secondary px-4 py-2.5 text-sm leading-relaxed text-secondary-foreground">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12">
                    <KalmLogo className="size-3.5 text-primary" aria-hidden />
                  </span>
                  <p className="min-w-0 flex-1 whitespace-pre-line text-[0.95rem] leading-7">
                    {message.content}
                  </p>
                </div>
              ),
            )}

            {actions.length > 0 && (
              <div className="ml-10 space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                {actions.map((action, index) => (
                  <div key={`${action.type}-${index}`} className="text-sm">
                    <p>{action.summary}</p>
                    {action.type === "exercise_launch" && (
                      <Link
                        to="/exercises"
                        className="mt-1 inline-block rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                      >
                        Open {action.title}
                      </Link>
                    )}
                    {action.type === "stepup_suggested" && (
                      <Link
                        to="/care"
                        className="mt-1 inline-block rounded-full border border-border bg-card px-3 py-1.5 text-xs"
                      >
                        See support options
                      </Link>
                    )}
                    {action.type === "screener_completed" && (
                      <>
                        <Link
                          to="/insights"
                          className="mt-1 inline-block rounded-full border border-border bg-card px-3 py-1.5 text-xs"
                        >
                          See your check-in history
                        </Link>
                        {action.crisis && (
                          <div className="mt-3">
                            <CrisisCard />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pending && (
              <div className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-line rounded-2xl bg-secondary px-4 py-2.5 text-sm leading-relaxed text-secondary-foreground">
                  {pending}
                </p>
              </div>
            )}

            {busy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {voice.isPending ? t("chat.listening") : t("chat.thinking")}
              </p>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer: single rounded card with mic + send inside, Claude-style. */}
        <div className="shrink-0 px-4 pb-3">
          <div className="mx-auto w-full max-w-2xl">
            <div className="rounded-3xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/40">
              <textarea
                ref={inputRef}
                rows={2}
                maxLength={4000}
                value={input}
                placeholder={t("chat.inputPlaceholder")}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit(input);
                  }
                }}
                className="max-h-40 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
                <span className="pl-2 text-[0.7rem] text-muted-foreground">
                  {recorder.recording ? t("chat.recordingHint") : t("chat.enterToSend")}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={
                      recorder.recording ? t("chat.stopRecording") : t("chat.recordVoice")
                    }
                    onClick={() => (recorder.recording ? recorder.stop() : recorder.start())}
                    disabled={busy}
                    className={`flex size-9 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                      recorder.recording
                        ? "bg-destructive text-destructive-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {recorder.recording ? (
                      <Square className="size-4" aria-hidden />
                    ) : (
                      <Mic className="size-4" aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={t("chat.sendMessage")}
                    disabled={!input.trim() || busy}
                    onClick={() => submit(input)}
                    className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            {empty && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setQuickAction(action.id);
                      mutation.mutate(action.prompt);
                    }}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {t(`quickActions.${action.id}`)}
                  </button>
                ))}
              </div>
            )}

            <p className="pt-2 text-center text-[0.7rem] text-muted-foreground">
              {t("chat.disclaimer")}
            </p>
          </div>
        </div>
      </section>

      {callOpen && (
        <VoiceCallOverlay
          threadId={threadId}
          onClose={() => {
            setCallOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["chat-thread", threadId] });
          }}
        />
      )}
    </div>
  );
}
