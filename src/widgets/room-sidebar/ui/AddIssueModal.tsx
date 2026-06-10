import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import type { Issue } from "../../../entities/room/model/types";
import type { IssueDetailsInput } from "../../../features/manage-issues/model/issues";

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
            <span className="eyebrow">Story</span>
            <h2 id="add-story-title">{isEditing ? "Edit story" : "Add story"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close add story form">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form className="story-form" onSubmit={handleSubmit}>
          <label>
            Title
            <input
              value={issue.title}
              onChange={(event) => setIssue((current) => ({ ...current, title: event.target.value }))}
              placeholder="Good task"
              autoFocus
              required
            />
          </label>
          <label>
            Link
            <input
              value={issue.link}
              onChange={(event) => setIssue((current) => ({ ...current, link: event.target.value }))}
              placeholder="https://jira.example.org/browse/TASK-200"
              inputMode="url"
            />
          </label>
          <label>
            Description
            <textarea
              value={issue.description}
              onChange={(event) => setIssue((current) => ({ ...current, description: event.target.value }))}
              placeholder="Perfect long description"
              rows={5}
            />
          </label>

          <div className="modal-actions">
            <button className="ghost-action" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className={`primary-action ${isSaving ? "is-syncing" : ""}`} type="submit" disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="spin" size={18} aria-hidden="true" />
              ) : isEditing ? (
                <Pencil size={18} aria-hidden="true" />
              ) : (
                <Plus size={18} aria-hidden="true" />
              )}
              {isEditing ? "Save story" : "Add story"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
