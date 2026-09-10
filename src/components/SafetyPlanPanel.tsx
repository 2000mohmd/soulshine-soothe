// The person's own safety plan, as a slide-over inside the chat screen — there
// is deliberately no separate page for it, so it's reachable in the moment.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import {
  SAFETY_PLAN_SECTIONS,
  getMySafetyPlan,
  saveMySafetyPlan,
  type SafetyPlanSection,
} from "@/lib/safety-plan.functions";
import { useTranslation } from "@/lib/i18n";

type Draft = Record<SafetyPlanSection, string[]>;

const EMPTY_DRAFT: Draft = {
  warning_signs: [],
  coping_steps: [],
  people: [],
  professionals: [],
  safer_space: [],
  reasons_to_stay: [],
};

function SectionEditor({
  section,
  values,
  onChange,
}: {
  section: SafetyPlanSection;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const { t } = useTranslation();
  const [entry, setEntry] = useState("");

  const add = () => {
    const value = entry.trim();
    if (!value) return;
    onChange([...values, value].slice(0, 20));
    setEntry("");
  };

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{t(`safetyPlan.${section}`)}</h3>
        <p className="text-xs text-muted-foreground">{t(`safetyPlan.${section}Hint`)}</p>
      </div>

      {values.length > 0 && (
        <ul className="space-y-1.5">
          {values.map((value, index) => (
            <li
              key={`${value}-${index}`}
              className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 break-words">{value}</span>
              <button
                type="button"
                aria-label={t("safetyPlan.remove")}
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          value={entry}
          maxLength={240}
          placeholder={t("safetyPlan.addPlaceholder")}
          onChange={(event) => setEntry(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        <button
          type="button"
          aria-label={t("safetyPlan.add")}
          onClick={add}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

export function SafetyPlanPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fetchPlan = useServerFn(getMySafetyPlan);
  const savePlan = useServerFn(saveMySafetyPlan);

  const { data, isLoading } = useQuery({
    queryKey: ["safety-plan"],
    queryFn: () => fetchPlan(),
  });

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!data) return;
    setDraft({
      warning_signs: data.plan.warning_signs,
      coping_steps: data.plan.coping_steps,
      people: data.plan.people,
      professionals: data.plan.professionals,
      safer_space: data.plan.safer_space,
      reasons_to_stay: data.plan.reasons_to_stay,
    });
    setNotes(data.plan.notes ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: () => savePlan({ data: { ...draft, notes: notes || null } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-plan"] });
      toast.success(t("safetyPlan.saved"));
    },
    onError: () => toast.error(t("safetyPlan.saveFailed")),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20 backdrop-blur-sm">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <aside className="flex h-full w-full max-w-md flex-col border-s border-border bg-background shadow-xl">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg">{t("safetyPlan.title")}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("safetyPlan.intro")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
            </p>
          ) : (
            <>
              {SAFETY_PLAN_SECTIONS.map((section) => (
                <SectionEditor
                  key={section}
                  section={section}
                  values={draft[section]}
                  onChange={(values) => setDraft((current) => ({ ...current, [section]: values }))}
                />
              ))}

              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("safetyPlan.notes")}</h3>
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
              </section>
            </>
          )}
        </div>

        <footer className="border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("safetyPlan.save")}
          </button>
        </footer>
      </aside>
    </div>
  );
}
