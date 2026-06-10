import { Eye, EyeOff, RefreshCcw } from "lucide-react";
import type { Issue, Participant, Room, Vote } from "../../../entities/room/model/types";

type VoteSummary = {
  average: number;
  min: number;
  max: number;
} | null;

type VotingTableProps = {
  activeIssue: Issue | null;
  activeVotes: Vote[];
  currentParticipant: Participant;
  currentVote: Vote | null;
  isHost: boolean;
  room: Room;
  summary: VoteSummary;
  votersCount: number;
  voteGroups: Record<string, number>;
  onCastVote: (value: string) => void;
  onRevealVotes: () => void;
  onResetVoting: () => void;
  onSetEstimate: (value: string) => void;
};

export function VotingTable({
  activeIssue,
  activeVotes,
  currentParticipant,
  currentVote,
  isHost,
  room,
  summary,
  votersCount,
  voteGroups,
  onCastVote,
  onRevealVotes,
  onResetVoting,
  onSetEstimate,
}: VotingTableProps) {
  return (
    <section className="table">
      <div className="story-header">
        <div>
          <span className="eyebrow">Active story</span>
          <h2>{activeIssue?.title ?? "No story selected"}</h2>
        </div>
        <div className="story-state">
          {room.revealed ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
          {room.revealed ? "Revealed" : "Voting"}
        </div>
      </div>

      <div className="cards-grid" aria-label="Vote cards">
        {room.card_set.map((card) => (
          <button
            key={card}
            type="button"
            className={`card-button ${currentVote?.value === card ? "selected" : ""}`}
            onClick={() => onCastVote(card)}
            disabled={!activeIssue || currentParticipant.is_spectator || room.revealed}
          >
            {card}
          </button>
        ))}
      </div>

      <div className="status-grid">
        <div className="metric">
          <span>Votes</span>
          <strong>
            {activeVotes.length}/{votersCount}
          </strong>
        </div>
        <div className="metric">
          <span>Average</span>
          <strong>{summary ? summary.average.toFixed(1) : "-"}</strong>
        </div>
        <div className="metric">
          <span>Range</span>
          <strong>{summary ? `${summary.min}-${summary.max}` : "-"}</strong>
        </div>
      </div>

      {room.revealed ? (
        <div className="results">
          {Object.entries(voteGroups).map(([value, count]) => (
            <div className="result-row" key={value}>
              <span>{value}</span>
              <div className="result-bar">
                <i style={{ width: `${(count / Math.max(1, activeVotes.length)) * 100}%` }} />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="hidden-results">
          <EyeOff size={24} aria-hidden="true" />
          Votes stay hidden until the facilitator reveals them.
        </div>
      )}

      {isHost ? (
        <div className="host-controls">
          <button className="primary-action" type="button" onClick={onRevealVotes} disabled={!activeVotes.length || room.revealed}>
            <Eye size={18} aria-hidden="true" />
            Reveal
          </button>
          <button className="secondary-action" type="button" onClick={onResetVoting}>
            <RefreshCcw size={18} aria-hidden="true" />
            Reset
          </button>
          <select
            value={activeIssue?.estimate ?? ""}
            onChange={(event) => onSetEstimate(event.target.value)}
            disabled={!activeIssue}
            aria-label="Final estimate"
          >
            <option value="">Estimate</option>
            {room.card_set.map((card) => (
              <option key={card} value={card}>
                {card}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </section>
  );
}
