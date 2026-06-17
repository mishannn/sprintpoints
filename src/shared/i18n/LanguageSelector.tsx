import { Select } from "@mantine/core";
import { Globe2 } from "lucide-react";
import { languages, useI18n } from ".";

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();

  return (
    <Select
      aria-label={t("aria.language")}
      data={languages.map((item) => ({ value: item.code, label: item.label }))}
      leftSection={<Globe2 size={17} aria-hidden="true" />}
      value={language}
      w={172}
      onChange={(value) => setLanguage(value === "ru" ? "ru" : "en")}
    />
  );
}
