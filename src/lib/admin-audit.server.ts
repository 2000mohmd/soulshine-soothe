// Admin audit trail. Every privileged admin action funnels through here so
// there is a durable record of who looked at (or changed) what.

export type AuditAction =
  | "viewed_user"
  | "resolved_crisis_event"
  | "replied_support_ticket"
  | "granted_role"
  | "revoked_role"
  | "claimed_human_support_request"
  | "closed_human_support_request"
  | "replied_human_support_request";

export type AuditEntryInput = {
  adminUserId: string;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Best-effort write: an audit failure must never break the admin action the
 * caller just performed, but it is logged loudly server-side.
 */
export async function logAuditEntry(entry: AuditEntryInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: entry.adminUserId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      metadata: (entry.metadata ?? {}) as never,
    });
    if (error) console.error("[admin-audit] insert failed", error.message);
  } catch (error) {
    console.error("[admin-audit] unexpected failure", error);
  }
}

export type AuditLogRow = {
  id: string;
  admin_user_id: string;
  admin_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
};

export async function fetchAuditLog(filters: {
  adminUserId?: string | null;
  action?: string | null;
  limit?: number;
}): Promise<{
  entries: AuditLogRow[];
  admins: { id: string; name: string | null }[];
  actions: string[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin
    .from("admin_audit_log")
    .select("id, admin_user_id, action, target_type, target_id, created_at")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.adminUserId) query = query.eq("admin_user_id", filters.adminUserId);
  if (filters.action) query = query.eq("action", filters.action);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // Every admin who has ever acted, so the filter dropdown has real options.
  const [{ data: allAdmins }, { data: actionRows }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]),
    supabaseAdmin.from("admin_audit_log").select("action").limit(1000),
  ]);

  const adminIds = [
    ...new Set([...(allAdmins ?? []).map((r) => r.user_id), ...rows.map((r) => r.admin_user_id)]),
  ];
  const names = new Map<string, string | null>();
  if (adminIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, preferred_name")
      .in("id", adminIds);
    for (const profile of profiles ?? []) names.set(profile.id, profile.preferred_name);
  }

  return {
    entries: rows.map((row) => ({
      ...row,
      admin_name: names.get(row.admin_user_id) ?? null,
    })),
    admins: adminIds.map((id) => ({ id, name: names.get(id) ?? null })),
    actions: [...new Set((actionRows ?? []).map((r) => r.action))].sort(),
  };
}
