import { useServerFn } from "@tanstack/react-start";
import { Languages } from "lucide-react";
import { LANGUAGES, useTranslation, type Language } from "@/lib/i18n";
import { setMyLanguage } from "@/lib/language.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * App-language picker. Updates the client immediately (cookie + localStorage +
 * <html lang/dir>) and, for signed-in users, persists to their profile.
 * Signed-out visitors keep the preference locally without calling the
 * protected profile endpoint.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { language, setLanguage, t } = useTranslation();
  const persist = useServerFn(setMyLanguage);

  async function handleChange(next: string) {
    const lang = next as Language;
    setLanguage(lang);

    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) return;

    try {
      await persist({ data: lang });
    } catch {
      // A session can expire between the check and write. The local preference
      // remains valid and can be synced after the next successful sign-in.
    }
  }

  return (
    <div className={className}>
      <Select value={language} onValueChange={handleChange}>
        <SelectTrigger aria-label={t("language.label")} className="w-[190px] rounded-full bg-card">
          <Languages className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((entry) => (
            <SelectItem key={entry.code} value={entry.code}>
              {entry.nativeLabel}
              {entry.code !== "en" ? ` · ${entry.label}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {language !== "en" ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("language.reviewNotice")}</p>
      ) : null}
    </div>
  );
}
