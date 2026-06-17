import { useState } from "react";
import { Download, ExternalLink, Loader2, Pencil, Plus, Settings, Trash2, Upload, Users } from "lucide-react";
import type { Issue, Participant, Vote } from "../../../entities/room/model/types";
import type { IssueDetailsInput, IssueImportInput } from "../../../features/manage-issues/model/issues";
import { downloadJiraCsv } from "../../../features/manage-issues/model/jiraCsv";
import type { PendingSync } from "../../../features/room-session/model/useRoomSession";
import { useI18n } from "../../../shared/i18n";
import { AddIssueModal } from "./AddIssueModal";
import { ImportIssuesModal } from "./ImportIssuesModal";

type RoomSidebarProps = {
  activeIssue: Issue | null;
  activeVotes: Vote[];
  isHost: boolean;
  issues: Issue[];
  pendingSync: PendingSync;
  participants: Participant[];
  roomName: string;
  onActivateIssue: (issue: Issue) => void;
  onAddIssue: (details: IssueDetailsInput) => Promise<boolean>;
  onDeleteIssue: (issue: Issue) => Promise<void>;
  onEditIssue: (issue: Issue, details: IssueDetailsInput) => Promise<boolean>;
  onImportIssues: (details: IssueImportInput[]) => Promise<boolean>;
};

function getExternalHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function RoomSidebar({
  activeIssue,
  activeVotes,
  isHost,
  issues,
  pendingSync,
  participants,
  roomName,
  onActivateIssue,
  onAddIssue,
  onDeleteIssue,
  onEditIssue,
  onImportIssues,
}: RoomSidebarProps) {
  const { t } = useI18n();
  const [isAddIssueOpen, setIsAddIssueOpen] = useState(false);
  const [isImportIssuesOpen, setIsImportIssuesOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);

  const closeModal = () => {
    setIsAddIssueOpen(false);
    setEditingIssue(null);
  };

  const handleModalSubmit = (details: IssueDetailsInput) => {
    if (editingIssue) {
      return onEditIssue(editingIssue, details);
    }

    return onAddIssue(details);
  };

  const handleDeleteIssue = (issue: Issue) => {
    if (!window.confirm(t("confirm.deleteStory"))) {
      return;
    }

    void onDeleteIssue(issue);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="section-title story-section-title">
          <Users size={18} aria-hidden="true" />
          <h2>{t("label.people")}</h2>
        </div>
        <div className="people-list">
          {participants.map((participant) => {
            const voted = activeVotes.some((vote) => vote.participant_id === participant.id);
            return (
              <div className="person-row" key={participant.id}>
                <div>
                  <strong>{participant.name}</strong>
                  <span>
                    {participant.is_spectator ? t("participant.spectator") : voted ? t("participant.voted") : t("participant.waiting")}
                  </span>
                </div>
                {!participant.is_spectator ? (
                  <div className={`vote-dot ${voted ? "done" : ""}`} aria-label={voted ? t("participant.voted") : t("aria.notVoted")} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-title story-section-title">
          <span className="section-title-label">
            <Settings size={18} aria-hidden="true" />
            <h2>{t("label.stories")}</h2>
          </span>
          {isHost ? (
            <div className="story-header-actions">
              <button
                className="icon-button"
                type="button"
                onClick={() => setIsImportIssuesOpen(true)}
                title={t("action.import")}
                aria-label={t("action.import")}
              >
                <Upload size={17} aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => downloadJiraCsv(issues, roomName)}
                disabled={issues.length === 0}
                title={t("action.export")}
                aria-label={t("action.export")}
              >
                <Download size={17} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
        <div className="issue-list">
          {issues.map((issue) => {
            const link = issue.link ?? "";

            return (
              <div className={`issue-card ${issue.id === activeIssue?.id ? "active" : ""}`} key={issue.id}>
                <button type="button" className="issue-open-button" onClick={() => onActivateIssue(issue)} disabled={!isHost}>
                  <span className="issue-row-main">
                    <span className="issue-title">{issue.title}</span>
                    {link ? <span className="issue-link-text">{link}</span> : null}
                  </span>
                </button>
                {issue.estimate || link || isHost ? (
                  <div className="issue-card-footer">
                    <span className="issue-row-side">
                      {pendingSync.activeIssueId === issue.id ? <Loader2 className="spin sync-spinner" size={15} aria-hidden="true" /> : null}
                      {issue.estimate ? <span className="issue-estimate">{issue.estimate}</span> : null}
                    </span>
                    <div className="issue-card-actions">
                      {link ? (
                        <a
                          className="icon-button compact-button"
                          href={getExternalHref(link)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t("action.openStoryLink")}
                        >
                          <ExternalLink size={16} aria-hidden="true" />
                        </a>
                      ) : null}
                      {isHost ? (
                        <>
                          <button
                            className="icon-button compact-button"
                            type="button"
                            onClick={() => setEditingIssue(issue)}
                            aria-label={t("action.editStory")}
                            disabled={pendingSync.editIssueId === issue.id || pendingSync.deleteIssueId === issue.id}
                          >
                            {pendingSync.editIssueId === issue.id ? (
                              <Loader2 className="spin" size={16} aria-hidden="true" />
                            ) : (
                              <Pencil size={16} aria-hidden="true" />
                            )}
                          </button>
                          <button
                            className="icon-button compact-button danger-button"
                            type="button"
                            onClick={() => handleDeleteIssue(issue)}
                            aria-label={t("action.deleteStory")}
                            disabled={pendingSync.deleteIssueId === issue.id || pendingSync.editIssueId === issue.id}
                          >
                            {pendingSync.deleteIssueId === issue.id ? (
                              <Loader2 className="spin" size={16} aria-hidden="true" />
                            ) : (
                              <Trash2 size={16} aria-hidden="true" />
                            )}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {isHost ? (
          <button className="secondary-action story-add-button" type="button" onClick={() => setIsAddIssueOpen(true)}>
            {pendingSync.addIssue ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            {t("action.addStory")}
          </button>
        ) : null}
      </div>

      <AddIssueModal
        issue={editingIssue}
        isOpen={isAddIssueOpen || Boolean(editingIssue)}
        isSaving={pendingSync.addIssue || Boolean(editingIssue && pendingSync.editIssueId === editingIssue.id)}
        onClose={closeModal}
        onSubmit={handleModalSubmit}
      />
      <ImportIssuesModal
        isOpen={isImportIssuesOpen}
        isSaving={pendingSync.addIssue}
        onClose={() => setIsImportIssuesOpen(false)}
        onSubmit={onImportIssues}
      />
    </aside>
  );
}
