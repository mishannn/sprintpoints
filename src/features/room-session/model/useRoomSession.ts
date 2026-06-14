import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlanningRoom } from "../../create-room/model/createRoom";
import { joinPlanningRoom } from "../../join-room/model/joinRoom";
import {
  createIssue,
  activateIssue as activateIssueRequest,
  importIssues as importIssuesRequest,
  saveIssueEstimate,
  updateIssueDetails,
  type IssueDetailsInput,
  type IssueImportInput,
} from "../../manage-issues/model/issues";
import { resetIssueVoting, revealRoomVotes, submitVote } from "../../vote/model/voting";
import { loadRoomState } from "../../../entities/room/model/roomApi";
import type { Issue, Notice, Participant, RoomState } from "../../../entities/room/model/types";
import { distribution, voteSummary } from "../../../entities/room/model/voteStats";
import { hasSupabaseConfig, supabase } from "../../../shared/api/supabase";
import { translateError, useI18n } from "../../../shared/i18n";
import { hostKey, participantKey } from "../../../shared/lib/roomStorage";
import { getJoinCodeFromUrl, setRoomUrl } from "../../../shared/lib/roomUrl";

export type PendingSync = {
  voteValue: string | null;
  revealVotes: boolean;
  resetVoting: boolean;
  activeIssueId: string | null;
  addIssue: boolean;
  editIssueId: string | null;
  estimate: boolean;
  refreshRoom: boolean;
};

const idlePendingSync: PendingSync = {
  voteValue: null,
  revealVotes: false,
  resetVoting: false,
  activeIssueId: null,
  addIssue: false,
  editIssueId: null,
  estimate: false,
  refreshRoom: false,
};

export function useRoomSession() {
  const { t } = useI18n();
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
    setNotice({ kind: "error", message: translateError(error, t, fallbackMessage) });
  }, [t]);

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
      showError(error, t("error.refreshRoom"));
    }
  }, [loadRoom, showError, state, t]);

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
      .catch((error) => showError(error, t("error.loadRoom")))
      .finally(() => setLoading(false));
  }, [loadRoom, showError, t]);

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
      const result = await createPlanningRoom(roomName, participantName, {
        facilitatorName: t("fallback.facilitator"),
        firstStoryTitle: t("fallback.firstStory"),
        roomName: t("fallback.roomName"),
      });

      localStorage.setItem(participantKey(result.state.room.id), result.participantToken);
      localStorage.setItem(hostKey(result.state.room.id), result.hostToken);
      setCurrentParticipant(result.participant);
      setHostToken(result.hostToken);
      setState(result.state);
      setRoomUrl(result.state.room.code);
      setNotice({ kind: "success", message: t("notice.roomCreated") });
    } catch (error) {
      showError(error, t("error.createRoom"));
    } finally {
      setLoading(false);
    }
  }, [showError, t]);

  const joinRoom = useCallback(async (code: string, name: string, isSpectator: boolean) => {
    setLoading(true);
    setNotice(null);

    try {
      const result = await joinPlanningRoom(code, name, isSpectator);

      localStorage.setItem(participantKey(result.room.id), result.participantToken);
      setCurrentParticipant(result.participant);
      setRoomUrl(result.room.code);
      await loadRoom(result.room.code);
      setNotice({ kind: "success", message: t("notice.joinedRoom") });
    } catch (error) {
      showError(error, t("error.joinRoom"));
    } finally {
      setLoading(false);
    }
  }, [loadRoom, showError, t]);

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
      showError(error, t("error.saveVote"));
    } finally {
      setPendingSync((current) => (voteSyncId.current === requestId ? { ...current, voteValue: null } : current));
    }
  }, [activeIssue, currentParticipant, currentVote, loadRoom, showError, state, setPending, t]);

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
      showError(error, t("error.revealVotes"));
    } finally {
      setPending({ revealVotes: false });
    }
  }, [isHost, loadRoom, setPending, showError, state, t]);

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
      showError(error, t("error.resetVoting"));
    } finally {
      setPending({ resetVoting: false });
    }
  }, [activeIssue, isHost, loadRoom, setPending, showError, state, t]);

  const addIssue = useCallback(async (details: IssueDetailsInput) => {
    if (!state || !isHost) {
      return false;
    }

    setNotice(null);
    setPending({ addIssue: true });

    try {
      const issue = await createIssue(state.room.id, details, state.issues);
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
      showError(error, t("error.addStory"));
      return false;
    } finally {
      setPending({ addIssue: false });
    }
  }, [isHost, loadRoom, setPending, showError, state, t]);

  const editIssue = useCallback(async (issue: Issue, details: IssueDetailsInput) => {
    if (!state || !isHost) {
      return false;
    }

    const previousIssue = issue;
    const optimisticIssue = {
      ...issue,
      title: details.title.trim(),
      description: details.description.trim(),
      link: details.link.trim(),
    };

    setNotice(null);
    setPending({ editIssueId: issue.id });
    setState((current) =>
      current
        ? {
            ...current,
            issues: current.issues.map((item) => (item.id === issue.id ? optimisticIssue : item)),
          }
        : current,
    );

    try {
      const updatedIssue = await updateIssueDetails(issue.id, details);
      setState((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((item) => (item.id === issue.id ? updatedIssue : item)),
            }
          : current,
      );
      await loadRoom(state.room.code);
      return true;
    } catch (error) {
      setState((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((item) => (item.id === issue.id ? previousIssue : item)),
            }
          : current,
      );
      showError(error, t("error.updateStory"));
      return false;
    } finally {
      setPending({ editIssueId: null });
    }
  }, [isHost, loadRoom, setPending, showError, state, t]);

  const importIssues = useCallback(async (details: IssueImportInput[]) => {
    if (!state || !isHost) {
      return false;
    }

    setNotice(null);
    setPending({ addIssue: true });

    try {
      const issues = await importIssuesRequest(state.room.id, details, state.issues, state.room.active_issue_id);
      await loadRoom(state.room.code);
      setNotice({ kind: "success", message: t("notice.importedStories", { count: issues.length }) });
      return issues.length > 0;
    } catch (error) {
      showError(error, t("error.importStories"));
      return false;
    } finally {
      setPending({ addIssue: false });
    }
  }, [isHost, loadRoom, setPending, showError, state, t]);

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
      showError(error, t("error.activateStory"));
    } finally {
      setPendingSync((current) => (activeIssueSyncId.current === requestId ? { ...current, activeIssueId: null } : current));
    }
  }, [isHost, loadRoom, setPending, showError, state, t]);

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
      showError(error, t("error.saveEstimate"));
    } finally {
      setPendingSync((current) => (estimateSyncId.current === requestId ? { ...current, estimate: false } : current));
    }
  }, [activeIssue, isHost, loadRoom, setPending, showError, state, t]);

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
    editIssue,
    importIssues,
    activateIssue,
    setEstimate,
    refreshRoom,
  };
}
