import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import type { Issue } from "../../../entities/room/model/types";
import type { IssueDetailsInput } from "../../../features/manage-issues/model/issues";
import { useI18n } from "../../../shared/i18n";

type AddIssueModalProps = {
  issue: Issue | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (details: IssueDetailsInput) => Promise<boolean>;
};

const emptyIssue: IssueDetailsInput = {
  title: "",
  description: "",
  link: "",
};

function getInitialIssue(issue: Issue | null): IssueDetailsInput {
  return issue
    ? {
        title: issue.title,
        description: issue.description ?? "",
        link: issue.link ?? "",
      }
    : emptyIssue;
}

export function AddIssueModal({ issue: editingIssue, isOpen, isSaving, onClose, onSubmit }: AddIssueModalProps) {
  const { t } = useI18n();
  const [issue, setIssue] = useState<IssueDetailsInput>(emptyIssue);
  const isEditing = Boolean(editingIssue);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setIssue(getInitialIssue(editingIssue));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingIssue, isOpen, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const added = await onSubmit(issue);
    if (added) {
      setIssue(emptyIssue);
      onClose();
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="add-story-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">{t("common.story")}</span>
            <h2 id="add-story-title">{isEditing ? t("modal.editStoryTitle") : t("modal.addStoryTitle")}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("action.closeAddStoryForm")}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form className="story-form" onSubmit={handleSubmit}>
          <label>
            {t("common.title")}
            <input
              value={issue.title}
              onChange={(event) => setIssue((current) => ({ ...current, title: event.target.value }))}
              placeholder={t("placeholder.title")}
              autoFocus
              required
            />
          </label>
          <label>
            {t("common.link")}
            <input
              value={issue.link}
              onChange={(event) => setIssue((current) => ({ ...current, link: event.target.value }))}
              placeholder={t("placeholder.link")}
              inputMode="url"
            />
          </label>
          <label>
            {t("common.description")}
            <textarea
              value={issue.description}
              onChange={(event) => setIssue((current) => ({ ...current, description: event.target.value }))}
              placeholder={t("placeholder.description")}
              rows={5}
            />
          </label>

          <div className="modal-actions">
            <button className="ghost-action" type="button" onClick={onClose}>
              {t("action.cancel")}
            </button>
            <button className={`primary-action ${isSaving ? "is-syncing" : ""}`} type="submit" disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="spin" size={18} aria-hidden="true" />
              ) : isEditing ? (
                <Pencil size={18} aria-hidden="true" />
              ) : (
                <Plus size={18} aria-hidden="true" />
              )}
              {isEditing ? t("action.saveStory") : t("action.addStory")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
