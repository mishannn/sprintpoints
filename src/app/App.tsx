import { hasSupabaseConfig } from "../shared/api/supabase";
import { getJoinCodeFromUrl } from "../shared/lib/roomUrl";
import { useRoomSession } from "../features/room-session/model/useRoomSession";
import { LobbyPage } from "../pages/lobby/ui/LobbyPage";
import { RoomPage } from "../pages/room/ui/RoomPage";
import { SetupRequiredPage } from "../pages/setup-required/ui/SetupRequiredPage";

export function App() {
  const session = useRoomSession();

  if (!hasSupabaseConfig) {
    return <SetupRequiredPage />;
  }

  if (!session.state || !session.currentParticipant) {
    return (
      <LobbyPage
        initialRoomCode={getJoinCodeFromUrl()}
        loading={session.loading}
        notice={session.notice}
        onCreateRoom={session.createRoom}
        onJoinRoom={session.joinRoom}
      />
    );
  }

  return (
    <RoomPage
      activeIssue={session.activeIssue}
      activeVotes={session.activeVotes}
      currentParticipant={session.currentParticipant}
      currentVote={session.currentVote}
      isHost={session.isHost}
      notice={session.notice}
      pendingSync={session.pendingSync}
      state={session.state}
      summary={session.summary}
      votersCount={session.voters.length}
      voteGroups={session.voteGroups}
      onActivateIssue={session.activateIssue}
      onAddIssue={session.addIssue}
      onCastVote={session.castVote}
      onRefreshRoom={session.refreshRoom}
      onResetVoting={session.resetVoting}
      onRevealVotes={session.revealVotes}
      onSetEstimate={session.setEstimate}
    />
  );
}
