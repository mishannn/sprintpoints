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

function formatOptionLabel(header: string, index: number) {
  return `${index + 1}. ${header || "Unnamed column"}`;
}

export function ImportIssuesModal({ isOpen, isSaving, onClose, onSubmit }: ImportIssuesModalProps) {
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [mapping, setMapping] = useState<JiraImportMapping>(emptyMapping);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputId = useId();

  const mappedIssues = useMemo(() => (csvData ? mapJiraCsvRows(csvData, mapping) : []), [csvData, mapping]);
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
        throw new Error("CSV header row is empty.");
      }

      setCsvData(data);
      setMapping(getInitialJiraImportMapping(data.headers));
      setFileName(file.name);
      setError(null);
    } catch (parseError) {
      setCsvData(null);
      setMapping(emptyMapping);
      setFileName("");
      setError(parseError instanceof Error ? parseError.message : "Could not read the CSV file.");
    }
  }

  function updateMapping(field: MappingField, value: string) {
    setMapping((current) => ({ ...current, [field]: parseSelectValue(value) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mapping.title === null) {
      setError("Choose a column for Title.");
      return;
    }

    if (mappedIssues.length === 0) {
      setError("No stories found with the selected mapping.");
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
            <span className="eyebrow">CSV</span>
            <h2 id="import-stories-title">Import stories</h2>
          </div>
          <button className="icon-button" type="button" onClick={close} aria-label="Close import form">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form className="story-form" onSubmit={handleSubmit}>
          <div className="csv-file-field">
            <input id={fileInputId} className="visually-hidden-input" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
            <label className="csv-file-button" htmlFor={fileInputId}>
              <FileUp size={18} aria-hidden="true" />
              Choose CSV file
            </label>
          </div>

          {fileName ? <p className="import-file-name">{fileName}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}

          {csvData ? (
            <>
              <div className="mapping-grid">
                <label>
                  Title
                  <select value={mapping.title ?? ""} onChange={(event) => updateMapping("title", event.target.value)} required>
                    <option value="">Choose column</option>
                    {csvData.headers.map((header, index) => (
                      <option key={`${index}-${header}`} value={index}>
                        {formatOptionLabel(header, index)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Description
                  <select value={mapping.description ?? ""} onChange={(event) => updateMapping("description", event.target.value)}>
                    <option value="">Skip</option>
                    {csvData.headers.map((header, index) => (
                      <option key={`${index}-${header}`} value={index}>
                        {formatOptionLabel(header, index)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Link
                  <select value={mapping.link ?? ""} onChange={(event) => updateMapping("link", event.target.value)}>
                    <option value="">Skip</option>
                    {csvData.headers.map((header, index) => (
                      <option key={`${index}-${header}`} value={index}>
                        {formatOptionLabel(header, index)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Estimate
                  <select value={mapping.estimate ?? ""} onChange={(event) => updateMapping("estimate", event.target.value)}>
                    <option value="">Skip</option>
                    {csvData.headers.map((header, index) => (
                      <option key={`${index}-${header}`} value={index}>
                        {formatOptionLabel(header, index)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="import-preview">
                <div className="import-preview-header">
                  <strong>{mappedIssues.length} stories</strong>
                  <span>{csvData.rows.length} CSV rows</span>
                </div>
                {previewRows.map((issue, index) => (
                  <div className="import-preview-row" key={`${issue.title}-${index}`}>
                    <strong>{issue.title}</strong>
                    <span>{issue.estimate || issue.link || issue.description || "No optional fields"}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="modal-actions">
            <button className="ghost-action" type="button" onClick={close}>
              Cancel
            </button>
            <button className={`primary-action ${isSaving ? "is-syncing" : ""}`} type="submit" disabled={isSaving || !csvData}>
              {isSaving ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <FileUp size={18} aria-hidden="true" />}
              Import
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
