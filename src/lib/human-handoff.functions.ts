// Member-facing "Connect me to a human now".
//
// A request is created immediately and unconditionally: the AI summary and the
// admin email are best-effort extras layered on top. The member is never told a
// human is already reading — only that the request is in and replies will land
// in this conversation.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type HumanSupportMessage = {
  id: string;
  sender: "user" | "human";
  content: string;
  created_at: string;
};

export type MyHumanSupportRequest = {
  id: string;
  status: "queued" | "claimed" | "closed";
  severity: string | null;
  created_at: string;
  claimed_at: string | null;
  closed_at: string | null;
  messages: HumanSupportMessage[];
};

export const requestHumanSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        thread_id: z.string().uuid().nullish(),
        note: z.string().trim().max(2000).nullish(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Reuse an open request instead of stacking duplicates when they press twice.
    const open = await supabase
      .from("human_support_requests")
      .select("id, status, created_at")
      .eq("user_id", userId)
      .in("status", ["queued", "claimed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open.error) throw open.error;

    const profile = await supabase
      .from("profiles")
      .select("preferred_name, language, timezone")
      .eq("id", userId)
      .maybeSingle();

    if (open.data) {
      if (data.note) {
        await supabase.from("human_support_messages").insert({
          request_id: open.data.id,
          sender: "user",
          content: data.note,
          author_id: userId,
        });
      }
      return { request_id: open.data.id, already_open: true, status: open.data.status };
    }

    // The most recent safety flag, if any — it tells the reviewer how urgent
    // this is without them having to read anything first.
    const flag = await supabase
      .from("crisis_events")
      .select("severity, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const recentFlag =
      flag.data && Date.now() - new Date(flag.data.created_at).getTime() < 6 * 60 * 60 * 1000
        ? flag.data.severity
        : null;

    const created = await supabase
      .from("human_support_requests")
      .insert({
        user_id: userId,
        thread_id: data.thread_id ?? null,
        severity: recentFlag,
        preferred_name: profile.data?.preferred_name ?? null,
        language: profile.data?.language ?? "en",
        timezone: profile.data?.timezone ?? null,
      })
      .select("id, status, created_at")
      .single();
    if (created.error) throw created.error;

    if (data.note) {
      await supabase.from("human_support_messages").insert({
        request_id: created.data.id,
        sender: "user",
        content: data.note,
        author_id: userId,
      });
    }

    // Everything below is best-effort; the row above is what matters.
    try {
      const { summarizeForHuman, sendHandoffAlertEmail } = await import("./human-handoff.server");

      let turns: { sender: string; content: string }[] = [];
      if (data.thread_id) {
        const history = await supabase
          .from("chat_messages")
          .select("sender, content, created_at")
          .eq("thread_id", data.thread_id)
          .order("created_at", { ascending: false })
          .limit(12);
        turns = (history.data ?? []).reverse().map((row) => ({
          sender: row.sender,
          content: row.content,
        }));
      }

      const summary = await summarizeForHuman(turns, {
        preferredName: profile.data?.preferred_name ?? null,
        severity: recentFlag,
        language: profile.data?.language ?? "en",
      });
      if (summary) {
        await supabase
          .from("human_support_requests")
          .update({ summary })
          .eq("id", created.data.id);
      }

      const sent = await sendHandoffAlertEmail({
        requestId: created.data.id,
        severity: recentFlag,
        createdAt: created.data.created_at,
      });
      if (sent) {
        await supabase
          .from("human_support_requests")
          .update({ alert_sent_at: new Date().toISOString() })
          .eq("id", created.data.id);
      }
    } catch (error) {
      console.error("[handoff] post-create steps failed", error);
    }

    return { request_id: created.data.id, already_open: false, status: created.data.status };
  });

/** The member's current (or most recent) request plus its messages. */
export const getMyHumanSupport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ request: MyHumanSupportRequest | null }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("human_support_requests")
      .select("id, status, severity, created_at, claimed_at, closed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { request: null };

    const messages = await supabase
      .from("human_support_messages")
      .select("id, sender, content, created_at")
      .eq("request_id", data.id)
      .order("created_at", { ascending: true });
    if (messages.error) throw messages.error;

    return {
      request: {
        id: data.id,
        status: data.status as MyHumanSupportRequest["status"],
        severity: data.severity ?? null,
        created_at: data.created_at,
        claimed_at: data.claimed_at ?? null,
        closed_at: data.closed_at ?? null,
        messages: (messages.data ?? []).map((row) => ({
          id: row.id,
          sender: row.sender as "user" | "human",
          content: row.content,
          created_at: row.created_at,
        })),
      },
    };
  });

export const replyToMyHumanSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        message: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const request = await supabase
      .from("human_support_requests")
      .select("id")
      .eq("id", data.request_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (request.error) throw request.error;
    if (!request.data) throw new Error("Not found");

    const { error } = await supabase.from("human_support_messages").insert({
      request_id: data.request_id,
      sender: "user",
      content: data.message,
      author_id: userId,
    });
    if (error) throw error;

    await supabase
      .from("human_support_requests")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.request_id);
    return { ok: true };
  });
