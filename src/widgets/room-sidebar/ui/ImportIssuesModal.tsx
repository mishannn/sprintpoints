import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import type { IssueImportInput } from "../../../features/manage-issues/model/issues";
import {
  getInitialJiraImportMapping,
  mapJiraCsvRows,
  parseCsv,
  type CsvData,
  type JiraImportMapping,
} from "../../../features/manage-issues/model/jiraCsv";
import { translateError, useI18n } from "../../../shared/i18n";
import { AppError } from "../../../shared/lib/AppError";

type ImportIssuesModalProps = {
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (issues: IssueImportInput[]) => Promise<boolean>;
};

type MappingField = keyof JiraImportMapping;

const emptyMapping: JiraImportMapping = {
  title: null,
  description: null,
  link: null,
  estimate: null,
};

function parseSelectValue(value: string) {
  return value === "" ? null : Number(value);
}

function formatOptionLabel(header: string, index: number, unnamedColumnLabel: string) {
  return `${index + 1}. ${header || unnamedColumnLabel}`;
}

export function ImportIssuesModal({ isOpen, isSaving, onClose, onSubmit }: ImportIssuesModalProps) {
  const { t } = useI18n();
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [mapping, setMapping] = useState<JiraImportMapping>(emptyMapping);
  const [linkPattern, setLinkPattern] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputId = useId();

  const mappedIssues = useMemo(() => (csvData ? mapJiraCsvRows(csvData, mapping, linkPattern) : []), [csvData, mapping, linkPattern]);
  const previewRows = mappedIssues.slice(0, 3);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  function reset() {
    setCsvData(null);
    setMapping(emptyMapping);
    setLinkPattern("");
    setFileName("");
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const data = parseCsv(await file.text());

      if (data.headers.length === 0) {
        throw new AppError("csvHeaderEmpty");
      }

      setCsvData(data);
      setMapping(getInitialJiraImportMapping(data.headers));
      setFileName(file.name);
      setError(null);
    } catch (parseError) {
      setCsvData(null);
      setMapping(emptyMapping);
      setLinkPattern("");
      setFileName("");
      setError(translateError(parseError, t, t("error.readCsv")));
    }
  }

  function updateMapping(field: MappingField, value: string) {
    setMapping((current) => ({ ...current, [field]: parseSelectValue(value) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mapping.title === null) {
      setError(t("error.chooseTitleColumn"));
      return;
    }

    if (mappedIssues.length === 0) {
      setError(t("error.noMappedStories"));
      return;
    }

    const imported = await onSubmit(mappedIssues);
    if (imported) {
      close();
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="modal-panel import-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-stories-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">{t("common.csv")}</span>
            <h2 id="import-stories-title">{t("modal.importStoriesTitle")}</h2>
          </div>
          <button className="icon-button" type="button" onClick={close} aria-label={t("action.closeImportForm")}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form className="story-form" onSubmit={handleSubmit}>
          <div className="csv-file-field">
            <input id={fileInputId} className="visually-hidden-input" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
            <label className="csv-file-button" htmlFor={fileInputId}>
              <FileUp size={18} aria-hidden="true" />
              {t("action.chooseCsvFile")}
            </label>
          </div>

          {fileName ? <p className="import-file-name">{fileName}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}

          {csvData ? (
            <>
              <div className="mapping-grid">
                <label>
                  {t("common.title")}
                  <select value={mapping.title ?? ""} onChange={(event) => updateMapping("title", event.target.value)} required>
                    <option value="">{t("action.chooseColumn")}</option>
                    {csvData.headers.map((header, index) => (
                      <option key={`${index}-${header}`} value={index}>
                        {formatOptionLabel(header, index, t("import.unnamedColumn"))}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("common.description")}
                  <select value={mapping.description ?? ""} onChange={(event) => updateMapping("description", event.target.value)}>
                    <option value="">{t("action.skip")}</option>
                    {csvData.headers.map((header, index) => (
                      <option key={`${index}-${header}`} value={index}>
                        {formatOptionLabel(header, index, t("import.unnamedColumn"))}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="link-mapping-group">
                  <label>
                    {t("common.link")}
                    <select value={mapping.link ?? ""} onChange={(event) => updateMapping("link", event.target.value)}>
                      <option value="">{t("action.skip")}</option>
                      {csvData.headers.map((header, index) => (
                        <option key={`${index}-${header}`} value={index}>
                          {formatOptionLabel(header, index, t("import.unnamedColumn"))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("field.linkPattern")}
                    <input
                      value={linkPattern}
                      onChange={(event) => setLinkPattern(event.target.value)}
                      placeholder={t("placeholder.linkPattern")}
                      inputMode="url"
                      disabled={mapping.link === null}
                    />
                  </label>
                  <span className="field-hint">{t("hint.linkPattern")}</span>
                </div>
                <label>
                  {t("common.estimate")}
                  <select value={mapping.estimate ?? ""} onChange={(event) => updateMapping("estimate", event.target.value)}>
                    <option value="">{t("action.skip")}</option>
                    {csvData.headers.map((header, index) => (
                      <option key={`${index}-${header}`} value={index}>
                        {formatOptionLabel(header, index, t("import.unnamedColumn"))}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="import-preview">
                <div className="import-preview-header">
                  <strong>{t("common.storiesCount", { count: mappedIssues.length })}</strong>
                  <span>{t("common.csvRows", { count: csvData.rows.length })}</span>
                </div>
                {previewRows.map((issue, index) => (
                  <div className="import-preview-row" key={`${issue.title}-${index}`}>
                    <strong>{issue.title}</strong>
                    <span>{issue.estimate || issue.link || issue.description || t("common.noOptionalFields")}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="modal-actions">
            <button className="ghost-action" type="button" onClick={close}>
              {t("action.cancel")}
            </button>
            <button className={`primary-action ${isSaving ? "is-syncing" : ""}`} type="submit" disabled={isSaving || !csvData}>
              {isSaving ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <FileUp size={18} aria-hidden="true" />}
              {t("action.import")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
