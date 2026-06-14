import { Check, Clipboard, Loader2, RefreshCcw } from "lucide-react";
import type { Issue, Notice, Participant, RoomState, Vote } from "../../../entities/room/model/types";
import type { IssueDetailsInput, IssueImportInput } from "../../../features/manage-issues/model/issues";
import type { PendingSync } from "../../../features/room-session/model/useRoomSession";
import { useCopyInviteLink } from "../../../features/copy-invite/model/useCopyInviteLink";
import { LanguageSelector } from "../../../shared/i18n/LanguageSelector";
import { useI18n } from "../../../shared/i18n";
import { InviteCard } from "../../../widgets/invite-card/ui/InviteCard";
import { RoomSidebar } from "../../../widgets/room-sidebar/ui/RoomSidebar";
import { VotingTable } from "../../../widgets/voting-table/ui/VotingTable";

type VoteSummary = {
  average: number;
  min: number;
  max: number;
} | null;

type RoomPageProps = {
  activeIssue: Issue | null;
  activeVotes: Vote[];
  currentParticipant: Participant;
  currentVote: Vote | null;
  isHost: boolean;
  notice: Notice | null;
  pendingSync: PendingSync;
  state: RoomState;
  summary: VoteSummary;
  votersCount: number;
  voteGroups: Record<string, number>;
  onActivateIssue: (issue: Issue) => void;
  onAddIssue: (details: IssueDetailsInput) => Promise<boolean>;
  onEditIssue: (issue: Issue, details: IssueDetailsInput) => Promise<boolean>;
  onImportIssues: (details: IssueImportInput[]) => Promise<boolean>;
  onCastVote: (value: string) => void;
  onRefreshRoom: () => void;
  onResetVoting: () => void;
  onRevealVotes: () => void;
  onSetEstimate: (value: string) => void;
};

export function RoomPage({
  activeIssue,
  activeVotes,
  currentParticipant,
  currentVote,
  isHost,
  notice,
  pendingSync,
  state,
  summary,
  votersCount,
  voteGroups,
  onActivateIssue,
  onAddIssue,
  onEditIssue,
  onImportIssues,
  onCastVote,
  onRefreshRoom,
  onResetVoting,
  onRevealVotes,
  onSetEstimate,
}: RoomPageProps) {
  const { t } = useI18n();
  const { copied, copyInviteLink } = useCopyInviteLink();

  const handleCopyInviteLink = () => {
    void copyInviteLink(state.room.code);
  };

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <span className="eyebrow">{t("common.room", { code: state.room.code })}</span>
          <h1>{state.room.name}</h1>
        </div>
        <div className="topbar-actions">
          <LanguageSelector />
          <button
            className="icon-button"
            type="button"
            onClick={handleCopyInviteLink}
            title={t("action.copyInviteLink")}
            aria-label={t("action.copyInviteLink")}
          >
            {copied ? <Check size={19} aria-hidden="true" /> : <Clipboard size={19} aria-hidden="true" />}
          </button>
          <button className="ghost-action" type="button" onClick={onRefreshRoom}>
            {pendingSync.refreshRoom ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <RefreshCcw size={17} aria-hidden="true" />}
            {t("action.sync")}
          </button>
        </div>
      </header>

      {notice ? <p className={`notice ${notice.kind}`}>{notice.message}</p> : null}

      <section className="room-layout">
        <RoomSidebar
          activeIssue={activeIssue}
          activeVotes={activeVotes}
          isHost={isHost}
          issues={state.issues}
          pendingSync={pendingSync}
          participants={state.participants}
          roomName={state.room.name}
          onActivateIssue={onActivateIssue}
          onAddIssue={onAddIssue}
          onEditIssue={onEditIssue}
          onImportIssues={onImportIssues}
        />

        <VotingTable
          activeIssue={activeIssue}
          activeVotes={activeVotes}
          currentParticipant={currentParticipant}
          currentVote={currentVote}
          isHost={isHost}
          pendingSync={pendingSync}
          room={state.room}
          summary={summary}
          votersCount={votersCount}
          voteGroups={voteGroups}
          onCastVote={onCastVote}
          onRevealVotes={onRevealVotes}
          onResetVoting={onResetVoting}
          onSetEstimate={onSetEstimate}
        />

        <InviteCard code={state.room.code} copied={copied} onCopyInviteLink={handleCopyInviteLink} />
      </section>
    </main>
  );
}
