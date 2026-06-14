import { Coffee, ExternalLink, Eye, EyeOff, Loader2, RefreshCcw } from "lucide-react";
import type { Issue, Participant, Room, Vote } from "../../../entities/room/model/types";
import type { PendingSync } from "../../../features/room-session/model/useRoomSession";
import { useI18n } from "../../../shared/i18n";

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
  pendingSync: PendingSync;
  room: Room;
  summary: VoteSummary;
  votersCount: number;
  voteGroups: Record<string, number>;
  onCastVote: (value: string) => void;
  onRevealVotes: () => void;
  onResetVoting: () => void;
  onSetEstimate: (value: string) => void;
};

function getExternalHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function VotingTable({
  activeIssue,
  activeVotes,
  currentParticipant,
  currentVote,
  isHost,
  pendingSync,
  room,
  summary,
  votersCount,
  voteGroups,
  onCastVote,
  onRevealVotes,
  onResetVoting,
  onSetEstimate,
}: VotingTableProps) {
  const { t } = useI18n();
  const activeDescription = activeIssue?.description ?? "";
  const activeLink = activeIssue?.link ?? "";
  const activeStoryLink = activeLink.trim() ? getExternalHref(activeLink.trim()) : null;

  return (
    <section className="table">
      <div className="story-header">
        <div>
          <span className="eyebrow">{t("label.activeStory")}</span>
          <h2>{activeIssue?.title ?? t("state.noStorySelected")}</h2>
        </div>
        <div className="story-state">
          {room.revealed ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
          {room.revealed ? t("state.revealed") : t("state.voting")}
        </div>
      </div>

      {activeIssue && (activeDescription || activeStoryLink) ? (
        <div className="story-details">
          {activeStoryLink ? (
            <div className="story-detail-row">
              <span>{t("common.link")}</span>
              <a href={activeStoryLink} target="_blank" rel="noreferrer">
                {activeLink}
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            </div>
          ) : null}
          {activeDescription ? (
            <div className="story-detail-row">
              <span>{t("common.description")}</span>
              <p>{activeDescription}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="cards-grid" aria-label={t("aria.voteCards")}>
        {room.card_set.map((card) => (
          <button
            key={card}
            type="button"
            className={`card-button ${currentVote?.value === card ? "selected" : ""}`}
            onClick={() => onCastVote(card)}
            disabled={!activeIssue || currentParticipant.is_spectator || room.revealed}
            aria-label={card}
          >
            {card === "Coffee" ? <Coffee size={34} strokeWidth={2.4} aria-hidden="true" /> : card}
            {pendingSync.voteValue === card ? <Loader2 className="spin card-sync" size={18} aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      <div className="status-grid">
        <div className="metric">
          <span>{t("common.votes")}</span>
          <strong>
            {activeVotes.length}/{votersCount}
          </strong>
        </div>
        <div className="metric">
          <span>{t("common.average")}</span>
          <strong>{summary ? summary.average.toFixed(1) : "-"}</strong>
        </div>
        <div className="metric">
          <span>{t("common.range")}</span>
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
          {t("voting.hiddenResults")}
        </div>
      )}

      {isHost ? (
        <div className="host-controls">
          <button
            className={`primary-action ${pendingSync.revealVotes ? "is-syncing" : ""}`}
            type="button"
            onClick={onRevealVotes}
            disabled={pendingSync.revealVotes || !activeVotes.length || (room.revealed && !pendingSync.revealVotes)}
          >
            {pendingSync.revealVotes ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            {t("action.reveal")}
          </button>
          <button
            className={`secondary-action ${pendingSync.resetVoting ? "is-syncing" : ""}`}
            type="button"
            onClick={onResetVoting}
            disabled={pendingSync.resetVoting}
          >
            {pendingSync.resetVoting ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <RefreshCcw size={18} aria-hidden="true" />}
            {t("action.reset")}
          </button>
          <div className="select-sync">
            <select
              value={activeIssue?.estimate ?? ""}
              onChange={(event) => onSetEstimate(event.target.value)}
              disabled={!activeIssue}
              aria-label={t("aria.finalEstimate")}
            >
              <option value="">{t("common.estimate")}</option>
              {room.card_set.map((card) => (
                <option key={card} value={card}>
                  {card}
                </option>
              ))}
            </select>
            {pendingSync.estimate ? <Loader2 className="spin select-spinner" size={16} aria-hidden="true" /> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
