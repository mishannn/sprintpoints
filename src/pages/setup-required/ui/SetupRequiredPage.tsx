import { Sparkles } from "lucide-react";
import { LanguageSelector } from "../../../shared/i18n/LanguageSelector";
import { useI18n } from "../../../shared/i18n";

export function SetupRequiredPage() {
  const { t } = useI18n();

  return (
    <main className="shell centered">
      <section className="setup-panel">
        <div className="setup-header">
          <div className="brand-mark">
            <Sparkles size={26} aria-hidden="true" />
          </div>
          <LanguageSelector />
        </div>
        <h1>{t("setup.heading")}</h1>
        <p>
          {t("setup.instructionsIntro")} <code>supabase/migrations</code>, {t("setup.instructionsAfterMigration")}{" "}
          <code>.env.example</code> {t("setup.instructionsTo")} <code>.env</code> {t("setup.instructionsOutro")}
        </p>
      </section>
    </main>
  );
}
