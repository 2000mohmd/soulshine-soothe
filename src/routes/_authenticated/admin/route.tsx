import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { amIAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const ADMIN_NAV = [
  { to: "/admin", label: "Overview", exact: true, superOnly: false },
  { to: "/admin/users", label: "Users", exact: false, superOnly: false },
  { to: "/admin/crisis", label: "Crisis", exact: false, superOnly: false },
  { to: "/admin/human", label: "Human support", exact: false, superOnly: false },
  { to: "/admin/support", label: "Support", exact: false, superOnly: false },
  { to: "/admin/team", label: "Team", exact: false, superOnly: true },
  { to: "/admin/audit", label: "Audit log", exact: false, superOnly: false },
] as const;

function AdminLayout() {
  const checkAdmin = useServerFn(amIAdmin);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => checkAdmin(),
    retry: false,
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <ShieldAlert className="size-5 text-primary" aria-hidden />
          <div className="mr-auto">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Internal
            </p>
            <p className="font-display text-lg leading-tight">Kalm admin</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/chat">
              <ArrowLeft className="size-4" aria-hidden />
              Back to app
            </Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : data?.isAdmin === false ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl">Not available</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This area is for administrators only.
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <Link to="/chat">Back to Kalm</Link>
            </Button>
          </div>
        ) : (
          <>
            <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
              {ADMIN_NAV.filter((item) => !item.superOnly || data?.isSuperAdmin).map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted data-[status=active]:bg-secondary data-[status=active]:text-secondary-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <Outlet />
          </>
        )}
      </div>
    </div>
  );
}
