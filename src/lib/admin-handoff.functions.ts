// Admin side of "Connect me to a human": the 24/7 desk queue.
//
// A reply here does two things — it lands in the request thread the member is
// watching, and it also drops a clearly-labelled message into their chat
// transcript so it is unmistakably a person, not the companion.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string): Promise<void> {
  const [{ data, error }, superAdmin] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  if (error) throw new Error(error.message);
  if (!data && !superAdmin.data) throw new Error("Forbidden");
}

export const listHumanSupportRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { fetchHandoffQueue } = await import("./human-handoff.server");
    return fetchHandoffQueue(context.supabase);
  });

export const countWaitingHumanRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const { data: isSuper } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (!isAdmin && !isSuper) return { isAdmin: false, waiting: 0 };

    const { count, error } = await supabase
      .from("human_support_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");
    if (error) throw error;
    return { isAdmin: true, waiting: count ?? 0 };
  });

export const getHumanSupportRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ request_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { fetchHandoffDetail } = await import("./human-handoff.server");
    return fetchHandoffDetail(context.supabase, data.request_id);
  });

export const claimHumanSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ request_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { error } = await supabase
      .from("human_support_requests")
      .update({ status: "claimed", claimed_by: userId, claimed_at: new Date().toISOString() })
      .eq("id", data.request_id);
    if (error) throw error;

    const { logAuditEntry } = await import("./admin-audit.server");
    await logAuditEntry({
      adminUserId: userId,
      action: "claimed_human_support_request",
      targetType: "human_support_request",
      targetId: data.request_id,
    });
    return { ok: true };
  });

export const closeHumanSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ request_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { error } = await supabase
      .from("human_support_requests")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", data.request_id);
    if (error) throw error;

    const { logAuditEntry } = await import("./admin-audit.server");
    await logAuditEntry({
      adminUserId: userId,
      action: "closed_human_support_request",
      targetType: "human_support_request",
      targetId: data.request_id,
    });
    return { ok: true };
  });

export const replyToHumanSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        message: z.string().trim().min(2).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const request = await supabase
      .from("human_support_requests")
      .select("id, user_id, thread_id, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (request.error) throw request.error;
    if (!request.data) throw new Error("Not found");

    const inserted = await supabase.from("human_support_messages").insert({
      request_id: data.request_id,
      sender: "human",
      content: data.message,
      author_id: userId,
    });
    if (inserted.error) throw inserted.error;

    // First reply also claims it, so the queue reflects reality.
    await supabase
      .from("human_support_requests")
      .update({
        status: request.data.status === "closed" ? "claimed" : "claimed",
        claimed_by: userId,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", data.request_id);

    // Mirror it into the member's transcript, labelled as a person.
    if (request.data.thread_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const saved = await supabaseAdmin.from("chat_messages").insert({
        thread_id: request.data.thread_id,
        user_id: request.data.user_id,
        sender: "system",
        content_type: "human_support",
        content: data.message,
      });
      if (saved.error) console.error("[handoff] transcript mirror failed", saved.error);
      await supabaseAdmin
        .from("chat_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", request.data.thread_id);
    }

    const { logAuditEntry } = await import("./admin-audit.server");
    await logAuditEntry({
      adminUserId: userId,
      action: "replied_human_support_request",
      targetType: "human_support_request",
      targetId: data.request_id,
    });
    return { ok: true };
  });
