import { Globe2 } from "lucide-react";
import { languages, useI18n } from ".";

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="language-selector">
      <Globe2 size={17} aria-hidden="true" />
      <span className="visually-hidden-label">{t("aria.language")}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value === "ru" ? "ru" : "en")} aria-label={t("aria.language")}>
        {languages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
