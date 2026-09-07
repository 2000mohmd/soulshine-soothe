import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LineChart,
  LogOut,
  MessageCircle,
  PanelLeft,
  Plus,
  Settings,
  Sparkles,
  Wind,
} from "lucide-react";
import type { ReactNode } from "react";
import { KalmLogo } from "@/components/KalmLogo";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/onboarding.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";
import { useSignedIn } from "@/hooks/use-signed-in";

export const SIDEBAR_NAV = [
  { to: "/chat", labelKey: "nav.companion", icon: MessageCircle },
  { to: "/insights", labelKey: "nav.progress", icon: LineChart },
  { to: "/exercises", labelKey: "nav.exercises", icon: Wind },
  { to: "/plans", labelKey: "nav.plans", icon: Sparkles },
  { to: "/settings", labelKey: "nav.profile", icon: Settings },
] as const;


type AppSidebarProps = {
  open: boolean;
  onToggle: () => void;
  /** Optional "New chat" handler — only the companion page passes this. */
  onNewChat?: () => void;
  newChatDisabled?: boolean;
  /** Recents list, rendered under the nav when expanded (chat page only). */
  recents?: ReactNode;
};

/**
 * Shared app rail used on every authenticated page. Collapsed it stays as a
 * narrow icon rail (never fully disappears) so the toggle is always reachable.
 */
export function AppSidebar({
  open,
  onToggle,
  onNewChat,
  newChatDisabled,
  recents,
}: AppSidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signedIn = useSignedIn();
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
    enabled: signedIn,
    retry: false,
  });
  const preferredName = profileData?.profile?.preferred_name;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-xl py-2 text-sm transition-colors ${
      open ? "px-2.5" : "justify-center px-0"
    } ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
    }`;

  return (
    <aside
      className={`${
        open ? "w-64" : "w-14"
      } sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-300 md:flex`}
    >
      <div className={`flex items-center pt-4 ${open ? "justify-between px-4" : "justify-center"}`}>
        {open && (
          <Link to="/chat" className="flex items-center gap-2 font-display text-xl">
            <KalmLogo className="size-5 text-primary" aria-hidden />
            Kalm
          </Link>
        )}
        <button
          type="button"
          aria-label={open ? t("nav.collapseSidebar") : t("nav.expandSidebar")}
          onClick={onToggle}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <PanelLeft className="size-4" aria-hidden />
        </button>
      </div>

      <div className={`pt-4 ${open ? "px-2" : "px-2"} space-y-0.5`}>
        {onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            disabled={newChatDisabled}
            title={t("nav.newConversation")}
            className={`flex w-full items-center gap-2.5 rounded-xl py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent disabled:opacity-50 ${
              open ? "px-2.5" : "justify-center px-0"
            }`}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Plus className="size-3.5" aria-hidden />
            </span>
            {open && t("nav.newConversation")}
          </button>
        )}
        {SIDEBAR_NAV.map(({ to, labelKey, icon: Icon }) => (
          <Link key={to} to={to} title={t(labelKey)} className={itemClass(pathname === to)}>
            <Icon className="size-4 shrink-0" aria-hidden />
            {open && t(labelKey)}
          </Link>
        ))}
      </div>

      {recents && open ? (
        <>
          <p className="px-4 pb-1 pt-6 text-xs font-medium text-muted-foreground">
            {t("nav.recents")}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{recents}</div>
        </>
      ) : (
        <div className="flex-1" />
      )}

      <div
        className={`flex items-center gap-2.5 border-t border-sidebar-border py-3 ${
          open ? "px-3" : "justify-center px-0"
        }`}
      >
        {profileLoading ? (
          <Skeleton className="size-8 shrink-0 rounded-full" />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {(preferredName ?? "K").slice(0, 2).toUpperCase()}
          </span>
        )}
        {open && (
          <>
            {profileLoading ? (
              <Skeleton className="h-4 min-w-0 flex-1 rounded" />
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm">
                {preferredName ?? t("nav.yourAccount")}
              </span>
            )}
            <button
              type="button"
              aria-label={t("nav.signOut")}
              onClick={handleSignOut}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
