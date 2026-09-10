// The link a guardian opens from their email. Public by necessity — the
// guardian has no account — so the only credential is the one-time token, and
// the handler renders its own confirmation page rather than adding an app page.
import { createFileRoute } from "@tanstack/react-router";

function page(title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title} — Kalm</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#f4f2fb; color:#241f36; font-family:ui-sans-serif,system-ui,-apple-system,sans-serif; padding:24px; }
  main { max-width:34rem; background:#fff; border-radius:20px; padding:32px; box-shadow:0 10px 40px rgba(60,40,120,.08); }
  h1 { font-size:1.5rem; margin:0 0 12px; }
  p { line-height:1.65; margin:0 0 12px; color:#4b4463; }
</style>
</head><body><main><h1>${title}</h1>${body}</main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const Route = createFileRoute("/api/public/guardian-consent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const action = url.searchParams.get("action") ?? "";

        if (!token || (action !== "approve" && action !== "withdraw")) {
          return page(
            "This link isn't valid",
            "<p>Please open the most recent link from the email we sent you.</p>",
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { applyGuardianDecision } = await import("@/lib/guardian-consent.server");

        const result = await applyGuardianDecision(supabaseAdmin, {
          token,
          action,
          ip:
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            null,
          userAgent: request.headers.get("user-agent"),
        });

        if (!result.ok) {
          return page(
            "This link isn't valid",
            "<p>It may have been replaced by a newer request. Please open the most recent email we sent you.</p>",
          );
        }

        if (result.action === "approve") {
          return page(
            "Thank you — permission given",
            [
              "<p>Their account is now active. They can use the companion, the exercises and the check-ins.</p>",
              "<p>Kalm is a wellness companion, not a therapist or an emergency service. If it ever detects that someone may be in danger, it stops the conversation, shows real crisis helplines, and alerts our safety team.</p>",
              "<p>You can withdraw this permission at any time using the withdraw link in the same email.</p>",
            ].join(""),
          );
        }

        return page(
          "Permission withdrawn",
          [
            "<p>The companion has been switched off for that account. Crisis helplines stay available to them — those are never hidden.</p>",
            "<p>You can give permission again at any time using the approve link in the same email.</p>",
          ].join(""),
        );
      },
    },
  },
});
