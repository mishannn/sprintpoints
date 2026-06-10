import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export type PendingSync = {
  voteValue: string | null;
  revealVotes: boolean;
  resetVoting: boolean;
  activeIssueId: string | null;
  addIssue: boolean;
  estimate: boolean;
  refreshRoom: boolean;
};

const idlePendingSync: PendingSync = {
  voteValue: null,
  revealVotes: false,
  resetVoting: false,
  activeIssueId: null,
  addIssue: false,
  estimate: false,
  refreshRoom: false,
};

export function useRoomSession() {
  const [state, setState] = useState<RoomState | null>(null);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingSync, setPendingSync] = useState<PendingSync>(idlePendingSync);
  const voteSyncId = useRef(0);
  const activeIssueSyncId = useRef(0);
  const estimateSyncId = useRef(0);

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

  const setPending = useCallback((patch: Partial<PendingSync>) => {
    setPendingSync((current) => ({ ...current, ...patch }));
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

  const refreshRoomState = useCallback(async () => {
    if (!state) {
      return;
    }

    try {
      await loadRoom(state.room.code);
    } catch (error) {
      showError(error, "Could not refresh the room.");
    }
  }, [loadRoom, showError, state]);

  const refreshRoom = useCallback(async () => {
    setPending({ refreshRoom: true });
    try {
      await refreshRoomState();
    } finally {
      setPending({ refreshRoom: false });
    }
  }, [refreshRoomState, setPending]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${state.room.id}` }, refreshRoomState)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${state.room.id}` }, refreshRoomState)
      .on("postgres_changes", { event: "*", schema: "public", table: "issues", filter: `room_id=eq.${state.room.id}` }, refreshRoomState)
      .on("postgres_changes", { event: "*", schema: "public", table: "votes", filter: `room_id=eq.${state.room.id}` }, refreshRoomState)
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [refreshRoomState, state]);

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

    const requestId = voteSyncId.current + 1;
    voteSyncId.current = requestId;
    const now = new Date().toISOString();
    const previousVote = currentVote;

    setNotice(null);
    setPending({ voteValue: value });
    setState((current) => {
      if (!current) {
        return current;
      }

      const optimisticVote = {
        id: previousVote?.id ?? `optimistic:${activeIssue.id}:${currentParticipant.id}`,
        room_id: current.room.id,
        issue_id: activeIssue.id,
        participant_id: currentParticipant.id,
        value,
        created_at: previousVote?.created_at ?? now,
        updated_at: now,
      };
      const voteExists = current.votes.some((vote) => vote.issue_id === activeIssue.id && vote.participant_id === currentParticipant.id);

      return {
        ...current,
        votes: voteExists
          ? current.votes.map((vote) =>
              vote.issue_id === activeIssue.id && vote.participant_id === currentParticipant.id ? optimisticVote : vote,
            )
          : [...current.votes, optimisticVote],
      };
    });

    try {
      await submitVote(state.room.id, activeIssue.id, currentParticipant.id, value);
      if (voteSyncId.current === requestId) {
        await loadRoom(state.room.code);
      }
    } catch (error) {
      if (voteSyncId.current === requestId) {
        setState((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            votes: previousVote
              ? current.votes.map((vote) =>
                  vote.issue_id === activeIssue.id && vote.participant_id === currentParticipant.id ? previousVote : vote,
                )
              : current.votes.filter((vote) => !(vote.issue_id === activeIssue.id && vote.participant_id === currentParticipant.id)),
          };
        });
      }
      showError(error, "Could not save your vote.");
    } finally {
      setPendingSync((current) => (voteSyncId.current === requestId ? { ...current, voteValue: null } : current));
    }
  }, [activeIssue, currentParticipant, currentVote, loadRoom, showError, state, setPending]);

  const revealVotes = useCallback(async () => {
    if (!state || !isHost) {
      return;
    }

    const wasRevealed = state.room.revealed;

    setNotice(null);
    setPending({ revealVotes: true });
    setState((current) => (current ? { ...current, room: { ...current.room, revealed: true } } : current));

    try {
      await revealRoomVotes(state.room.id);
      await loadRoom(state.room.code);
    } catch (error) {
      setState((current) => (current ? { ...current, room: { ...current.room, revealed: wasRevealed } } : current));
      showError(error, "Could not reveal votes.");
    } finally {
      setPending({ revealVotes: false });
    }
  }, [isHost, loadRoom, setPending, showError, state]);

  const resetVoting = useCallback(async () => {
    if (!state || !activeIssue || !isHost) {
      return;
    }

    const previousRevealed = state.room.revealed;
    const previousIssueVotes = state.votes.filter((vote) => vote.issue_id === activeIssue.id);

    setNotice(null);
    setPending({ resetVoting: true });
    setState((current) =>
      current
        ? {
            ...current,
            room: { ...current.room, revealed: false },
            votes: current.votes.filter((vote) => vote.issue_id !== activeIssue.id),
          }
        : current,
    );

    try {
      await resetIssueVoting(state.room.id, activeIssue.id);
      await loadRoom(state.room.code);
    } catch (error) {
      setState((current) =>
        current
          ? {
              ...current,
              room: { ...current.room, revealed: previousRevealed },
              votes: [...current.votes.filter((vote) => vote.issue_id !== activeIssue.id), ...previousIssueVotes],
            }
          : current,
      );
      showError(error, "Could not reset voting.");
    } finally {
      setPending({ resetVoting: false });
    }
  }, [activeIssue, isHost, loadRoom, setPending, showError, state]);

  const addIssue = useCallback(async (title: string) => {
    if (!state || !isHost) {
      return false;
    }

    setNotice(null);
    setPending({ addIssue: true });

    try {
      const issue = await createIssue(state.room.id, title, state.issues);
      if (issue) {
        setState((current) =>
          current
            ? {
                ...current,
                room: { ...current.room, active_issue_id: issue.id, revealed: false },
                issues: [...current.issues, issue],
              }
            : current,
        );
        await loadRoom(state.room.code);
      }
      return Boolean(issue);
    } catch (error) {
      showError(error, "Could not add the story.");
      return false;
    } finally {
      setPending({ addIssue: false });
    }
  }, [isHost, loadRoom, setPending, showError, state]);

  const activateIssue = useCallback(async (issue: Issue) => {
    if (!state || !isHost) {
      return;
    }

    const requestId = activeIssueSyncId.current + 1;
    activeIssueSyncId.current = requestId;
    const previousActiveIssueId = state.room.active_issue_id;
    const previousRevealed = state.room.revealed;

    setNotice(null);
    setPending({ activeIssueId: issue.id });
    setState((current) =>
      current
        ? {
            ...current,
            room: { ...current.room, active_issue_id: issue.id, revealed: false },
          }
        : current,
    );

    try {
      await activateIssueRequest(state.room.id, issue.id);
      if (activeIssueSyncId.current === requestId) {
        await loadRoom(state.room.code);
      }
    } catch (error) {
      if (activeIssueSyncId.current === requestId) {
        setState((current) =>
          current
            ? {
                ...current,
                room: { ...current.room, active_issue_id: previousActiveIssueId, revealed: previousRevealed },
              }
            : current,
        );
      }
      showError(error, "Could not switch story.");
    } finally {
      setPendingSync((current) => (activeIssueSyncId.current === requestId ? { ...current, activeIssueId: null } : current));
    }
  }, [isHost, loadRoom, setPending, showError, state]);

  const setEstimate = useCallback(async (value: string) => {
    if (!activeIssue || !isHost) {
      return;
    }

    const requestId = estimateSyncId.current + 1;
    estimateSyncId.current = requestId;
    const previousEstimate = activeIssue.estimate;

    setNotice(null);
    setPending({ estimate: true });
    setState((current) =>
      current
        ? {
            ...current,
            issues: current.issues.map((issue) => (issue.id === activeIssue.id ? { ...issue, estimate: value } : issue)),
          }
        : current,
    );

    try {
      await saveIssueEstimate(activeIssue.id, value);
      if (estimateSyncId.current === requestId && state) {
        await loadRoom(state.room.code);
      }
    } catch (error) {
      if (estimateSyncId.current === requestId) {
        setState((current) =>
          current
            ? {
                ...current,
                issues: current.issues.map((issue) =>
                  issue.id === activeIssue.id ? { ...issue, estimate: previousEstimate } : issue,
                ),
              }
            : current,
        );
      }
      showError(error, "Could not save the estimate.");
    } finally {
      setPendingSync((current) => (estimateSyncId.current === requestId ? { ...current, estimate: false } : current));
    }
  }, [activeIssue, isHost, loadRoom, setPending, showError, state]);

  return {
    state,
    currentParticipant,
    loading,
    notice,
    isHost,
    activeIssue,
    activeVotes,
    currentVote,
    pendingSync,
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
