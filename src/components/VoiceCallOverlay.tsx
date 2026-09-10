// Live voice call UI. Starts a session through POST /api/v1/calls/sessions,
// opens a WebRTC connection to the realtime voice provider with the short-lived
// token that endpoint returns, then ends the session on hang-up so the backend
// can store duration, transcript turns and cost.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, PhoneOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KalmLogo } from "@/components/KalmLogo";
import { useTranslation } from "@/lib/i18n";

type StartResponse = {
  session: { id: string };
  realtime: {
    model: string;
    voice: string;
    client_secret: string;
    webrtc_url: string;
    max_duration_seconds: number;
  };
};

type Status = "connecting" | "live" | "ended" | "error";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function VoiceCallOverlay({
  threadId,
  onClose,
}: {
  threadId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  const teardown = useCallback(async (reason: string) => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const sessionId = sessionRef.current;
    sessionRef.current = null;
    if (!sessionId) return;
    try {
      await fetch(`/api/v1/calls/sessions/${sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ end_reason: reason }),
      });
    } catch {
      // The session sweeper closes abandoned calls; nothing to show the person.
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/v1/calls/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ thread_id: threadId }),
        });
        const payload = (await response.json()) as StartResponse & { error?: string };
        if (!response.ok) {
          setStatus("error");
          setMessage(payload.error ?? t("call.startFailed"));
          return;
        }
        if (cancelled) return;
        sessionRef.current = payload.session.id;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        pc.ontrack = (event) => {
          if (audioRef.current) audioRef.current.srcObject = event.streams[0] ?? null;
        };
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") setStatus("live");
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            setStatus("error");
            setMessage(t("call.dropped"));
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpResponse = await fetch(
          `${payload.realtime.webrtc_url}?model=${encodeURIComponent(payload.realtime.model)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${payload.realtime.client_secret}`,
              "Content-Type": "application/sdp",
            },
            body: offer.sdp ?? "",
          },
        );
        if (!sdpResponse.ok) {
          setStatus("error");
          setMessage(t("call.startFailed"));
          await teardown("provider_error");
          return;
        }
        await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
      } catch {
        if (cancelled) return;
        setStatus("error");
        setMessage(t("call.micBlocked"));
        await teardown("client_error");
      }
    })();

    return () => {
      cancelled = true;
      void teardown("client_closed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  // AI disclosure: a voice that sounds human is easy to mistake for one, so the
  // reminder is repeated on screen every five minutes, plus once near the cutoff.
  const [reminder, setReminder] = useState<string | null>(null);
  useEffect(() => {
    if (status !== "live" || seconds === 0) return;
    if (seconds === 25 * 60) setReminder(t("call.aiReminderLate"));
    else if (seconds % (5 * 60) === 0) setReminder(t("call.aiReminder"));
  }, [seconds, status, t]);

  useEffect(() => {
    if (!reminder) return;
    const hide = setTimeout(() => setReminder(null), 12_000);
    return () => clearTimeout(hide);
  }, [reminder]);

  const hangUp = async () => {
    setStatus("ended");
    await teardown("user_ended");
    onClose();
  };

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/95 px-6 text-center backdrop-blur">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-secondary">
        <KalmLogo className="size-8 text-primary" aria-hidden />
      </span>

      {status === "connecting" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {t("call.connecting")}
        </p>
      )}
      {status === "live" && (
        <>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mic className="size-4 text-primary" aria-hidden /> {t("call.live")}
          </p>
          <p className="font-display text-3xl tabular-nums">{clock}</p>
        </>
      )}
      {status === "error" && (
        <p className="max-w-sm text-sm text-destructive">{message ?? t("call.startFailed")}</p>
      )}

      <button
        type="button"
        onClick={() => void hangUp()}
        className="flex items-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-sm text-destructive-foreground"
      >
        <PhoneOff className="size-4" aria-hidden />
        {status === "error" ? t("common.close") : t("call.end")}
      </button>

      <p className="max-w-sm text-[0.7rem] text-muted-foreground">{t("call.disclaimer")}</p>
      <audio ref={audioRef} autoPlay className="hidden" />
    </div>
  );
}
