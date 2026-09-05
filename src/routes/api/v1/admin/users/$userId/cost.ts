import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerCostReport } from "@/lib/billing/customer-cost.server";
import { ApiError, handle, json, requireAuth } from "../../../-shared";

/**
 * GET /api/v1/admin/users/:userId/cost — INTERNAL ONLY.
 *
 * Returns the customer's tier, billing interval, estimated chat cost, estimated
 * voice cost and combined cost for the current period, so actual cost versus
 * what they pay is visible per customer. Admins and super-admins only; this is
 * never surfaced on any member-facing route.
 */
export const Route = createFileRoute("/api/v1/admin/users/$userId/cost")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handle(async () => {
          const { supabase, userId: callerId } = await requireAuth(request);

          const [admin, superAdmin] = await Promise.all([
            supabase.rpc("has_role", { _user_id: callerId, _role: "admin" }),
            supabase.rpc("has_role", { _user_id: callerId, _role: "super_admin" }),
          ]);
          if (!admin.data && !superAdmin.data) throw new ApiError(403, "Forbidden");

          const target = params.userId;
          if (!target) throw new ApiError(400, "Missing user id");

          // Reads across another user's rows, so this runs with elevated access
          // AFTER the role check above.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return json(
            await getCustomerCostReport(supabaseAdmin as unknown as SupabaseClient, target),
          );
        }),
    },
  },
});
