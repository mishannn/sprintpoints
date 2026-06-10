import { useCallback, useEffect, useMemo, useState } from "react";
import { createPlanningRoom } from "../../create-room/model/createRoom";
import { joinPlanningRoom } from "../../join-room/model/joinRoom";
import { createIssue, activateIssue as activateIssueRequest, saveIssueEstimate } from "../../manage-issues/model/issues";
import { resetIssueVoting, revealRoomVotes, submitVote } from "../../vote/model/voting";
import { loadRoomState } from "../../../entities/room/model/roomApi";
import type { Issue, Notice, Participant, RoomState } from "../../../entities/room/model/types";
import { distribution, voteSummary } from "../../../entities/room/model/voteStats";
import { hasSupabaseConfig, supabase } from "../../../shared/api/supabase";
import { hostKey, participantKey } from "../../../shared/lib/roomStorage";
import { getJoinCodeFromUrl, setRoomUrl } from "../../../shared/lib/roomUrl";

export function useRoomSession() {
  const [state, setState] = useState<RoomState | null>(null);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const isHost = Boolean(state && hostToken && hostToken === state.room.host_token);
  const activeIssue = useMemo(
    () => state?.issues.find((issue) => issue.id === state.room.active_issue_id) ?? state?.issues[0] ?? null,
    [state],
  );
  const activeVotes = useMemo(
    () => state?.votes.filter((vote) => vote.issue_id === activeIssue?.id) ?? [],
    [activeIssue?.id, state?.votes],
  );
  const currentVote = activeVotes.find((vote) => vote.participant_id === currentParticipant?.id) ?? null;
  const voters = state?.participants.filter((participant) => !participant.is_spectator) ?? [];
  const summary = state?.room.revealed ? voteSummary(activeVotes) : null;
  const voteGroups = state?.room.revealed ? distribution(activeVotes) : {};

  const showError = useCallback((error: unknown, fallbackMessage: string) => {
    setNotice({ kind: "error", message: error instanceof Error ? error.message : fallbackMessage });
  }, []);

  const loadRoom = useCallback(async (code: string) => {
    const roomState = await loadRoomState(code);

    setState(roomState);
    setRoomUrl(roomState.room.code);

    const savedParticipantToken = localStorage.getItem(participantKey(roomState.room.id));
    const existingParticipant =
      roomState.participants.find((participant) => participant.token === savedParticipantToken) ?? null;
    setCurrentParticipant(existingParticipant);
    setHostToken(localStorage.getItem(hostKey(roomState.room.id)));

    return roomState;
  }, []);

  const refreshRoom = useCallback(async () => {
    if (!state) {
      return;
    }

    try {
      await loadRoom(state.room.code);
    } catch (error) {
      showError(error, "Could not refresh the room.");
    }
  }, [loadRoom, showError, state]);

  useEffect(() => {
    const code = getJoinCodeFromUrl();
    if (!code || !hasSupabaseConfig) {
      return;
    }

    setLoading(true);
    loadRoom(code)
      .catch((error) => showError(error, "Could not open room."))
      .finally(() => setLoading(false));
  }, [loadRoom, showError]);

  useEffect(() => {
    if (!state || !supabase) {
      return;
    }

    const client = supabase;
    const channel = client
      .channel(`room-${state.room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${state.room.id}` }, refreshRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${state.room.id}` }, refreshRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "issues", filter: `room_id=eq.${state.room.id}` }, refreshRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "votes", filter: `room_id=eq.${state.room.id}` }, refreshRoom)
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [refreshRoom, state]);

  useEffect(() => {
    if (!currentParticipant || !supabase) {
      return;
    }

    const client = supabase;
    const interval = window.setInterval(() => {
      void client
        .from("participants")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", currentParticipant.id)
        .eq("token", currentParticipant.token);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [currentParticipant]);

  const createRoom = useCallback(async (roomName: string, participantName: string) => {
    setLoading(true);
    setNotice(null);

    try {
      const result = await createPlanningRoom(roomName, participantName);

      localStorage.setItem(participantKey(result.state.room.id), result.participantToken);
      localStorage.setItem(hostKey(result.state.room.id), result.hostToken);
      setCurrentParticipant(result.participant);
      setHostToken(result.hostToken);
      setState(result.state);
      setRoomUrl(result.state.room.code);
      setNotice({ kind: "success", message: "Room created." });
    } catch (error) {
      showError(error, "Could not create the room.");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const joinRoom = useCallback(async (code: string, name: string, isSpectator: boolean) => {
    setLoading(true);
    setNotice(null);

    try {
      const result = await joinPlanningRoom(code, name, isSpectator);

      localStorage.setItem(participantKey(result.room.id), result.participantToken);
      setCurrentParticipant(result.participant);
      setRoomUrl(result.room.code);
      await loadRoom(result.room.code);
      setNotice({ kind: "success", message: "Joined the room." });
    } catch (error) {
      showError(error, "Could not join the room.");
    } finally {
      setLoading(false);
    }
  }, [loadRoom, showError]);

  const castVote = useCallback(async (value: string) => {
    if (!state || !activeIssue || !currentParticipant || currentParticipant.is_spectator) {
      return;
    }

    setNotice(null);
    try {
      await submitVote(state.room.id, activeIssue.id, currentParticipant.id, value);
    } catch (error) {
      showError(error, "Could not save your vote.");
    }
  }, [activeIssue, currentParticipant, showError, state]);

  const revealVotes = useCallback(async () => {
    if (!state || !isHost) {
      return;
    }

    try {
      await revealRoomVotes(state.room.id);
    } catch (error) {
      showError(error, "Could not reveal votes.");
    }
  }, [isHost, showError, state]);

  const resetVoting = useCallback(async () => {
    if (!state || !activeIssue || !isHost) {
      return;
    }

    try {
      await resetIssueVoting(state.room.id, activeIssue.id);
    } catch (error) {
      showError(error, "Could not reset voting.");
    }
  }, [activeIssue, isHost, showError, state]);

  const addIssue = useCallback(async (title: string) => {
    if (!state || !isHost) {
      return false;
    }

    try {
      const issue = await createIssue(state.room.id, title, state.issues);
      return Boolean(issue);
    } catch (error) {
      showError(error, "Could not add the story.");
      return false;
    }
  }, [isHost, showError, state]);

  const activateIssue = useCallback(async (issue: Issue) => {
    if (!state || !isHost) {
      return;
    }

    try {
      await activateIssueRequest(state.room.id, issue.id);
    } catch (error) {
      showError(error, "Could not switch story.");
    }
  }, [isHost, showError, state]);

  const setEstimate = useCallback(async (value: string) => {
    if (!activeIssue || !isHost) {
      return;
    }

    try {
      await saveIssueEstimate(activeIssue.id, value);
    } catch (error) {
      showError(error, "Could not save the estimate.");
    }
  }, [activeIssue, isHost, showError]);

  return {
    state,
    currentParticipant,
    loading,
    notice,
    isHost,
    activeIssue,
    activeVotes,
    currentVote,
    voters,
    summary,
    voteGroups,
    createRoom,
    joinRoom,
    castVote,
    revealVotes,
    resetVoting,
    addIssue,
    activateIssue,
    setEstimate,
    refreshRoom,
  };
}
