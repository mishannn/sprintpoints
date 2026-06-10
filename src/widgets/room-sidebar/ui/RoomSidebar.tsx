import type { FormEvent } from "react";
import { useState } from "react";
import { Plus, Settings, Users } from "lucide-react";
import type { Issue, Participant, Vote } from "../../../entities/room/model/types";

type RoomSidebarProps = {
  activeIssue: Issue | null;
  activeVotes: Vote[];
  isHost: boolean;
  issues: Issue[];
  participants: Participant[];
  onActivateIssue: (issue: Issue) => void;
  onAddIssue: (title: string) => Promise<boolean>;
};

export function RoomSidebar({
  activeIssue,
  activeVotes,
  isHost,
  issues,
  participants,
  onActivateIssue,
  onAddIssue,
}: RoomSidebarProps) {
  const [newIssueTitle, setNewIssueTitle] = useState("");

  async function handleAddIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const added = await onAddIssue(newIssueTitle);
    if (added) {
      setNewIssueTitle("");
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="section-title">
          <Users size={18} aria-hidden="true" />
          <h2>People</h2>
        </div>
        <div className="people-list">
          {participants.map((participant) => {
            const voted = activeVotes.some((vote) => vote.participant_id === participant.id);
            return (
              <div className="person-row" key={participant.id}>
                <div>
                  <strong>{participant.name}</strong>
                  <span>{participant.is_spectator ? "Spectator" : voted ? "Voted" : "Waiting"}</span>
                </div>
                {!participant.is_spectator ? (
                  <div className={`vote-dot ${voted ? "done" : ""}`} aria-label={voted ? "Voted" : "Not voted"} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-title">
          <Settings size={18} aria-hidden="true" />
          <h2>Stories</h2>
        </div>
        <div className="issue-list">
          {issues.map((issue) => (
            <button
              type="button"
              className={`issue-row ${issue.id === activeIssue?.id ? "active" : ""}`}
              key={issue.id}
              onClick={() => onActivateIssue(issue)}
              disabled={!isHost}
            >
              <span>{issue.title}</span>
              {issue.estimate ? <strong>{issue.estimate}</strong> : null}
            </button>
          ))}
        </div>
        {isHost ? (
          <form className="add-issue" onSubmit={handleAddIssue}>
            <input
              value={newIssueTitle}
              onChange={(event) => setNewIssueTitle(event.target.value)}
              placeholder="Add story"
              aria-label="Add story"
            />
            <button className="icon-button" type="submit" aria-label="Add story">
              <Plus size={18} aria-hidden="true" />
            </button>
          </form>
        ) : null}
      </div>
    </aside>
  );
}
