import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlanningRoom } from "../../create-room/model/createRoom";
import { joinPlanningRoom } from "../../join-room/model/joinRoom";
import {
  deleteParticipant as deleteParticipantRequest,
  sendParticipantHeartbeat,
  updateParticipantSpectatorMode,
} from "../../manage-participants/model/participants";
import {
  archiveIssue as archiveIssueRequest,
  archiveEstimatedIssues as archiveEstimatedIssuesRequest,
  createIssue,
  activateIssue as activateIssueRequest,
  deleteIssue as deleteIssueRequest,
  importIssues as importIssuesRequest,
  saveIssueEstimate,
  unarchiveIssue as unarchiveIssueRequest,
  updateIssueDetails,
  type IssueDetailsInput,
  type IssueImportInput,
} from "../../manage-issues/model/issues";
import { deleteParticipantIssueVote, resetIssueVoting, revealRoomVotes, submitVote } from "../../vote/model/voting";
import { loadRoomState } from "../../../entities/room/model/roomApi";
import type { Issue, Notice, Participant, RoomState } from "../../../entities/room/model/types";
import { distribution, voteSummary } from "../../../entities/room/model/voteStats";
import { translateError, useI18n } from "../../../shared/i18n";
import { hostKey, participantKey } from "../../../shared/lib/roomStorage";
import { getJoinCodeFromUrl, setRoomUrl } from "../../../shared/lib/roomUrl";
import { normalizeCode } from "../../../shared/lib/roomCode";

export type PendingSync = {
  voteValue: string | null;
  revealVotes: boolean;
  resetVoting: boolean;
  activeIssueId: string | null;
  addIssue: boolean;
  archiveEstimatedIssues: boolean;
  archiveIssueId: string | null;
  editIssueId: string | null;
  deleteIssueId: string | null;
  deleteParticipantId: string | null;
  observerMode: boolean;
  estimate: boolean;
  refreshRoom: boolean;
  unarchiveIssueId: string | null;
};

const idlePendingSync: PendingSync = {
  voteValue: null,
  revealVotes: false,
  resetVoting: false,
  activeIssueId: null,
  addIssue: false,
  archiveEstimatedIssues: false,
  archiveIssueId: null,
  editIssueId: null,
  deleteIssueId: null,
  deleteParticipantId: null,
  observerMode: false,
  estimate: false,
  refreshRoom: false,
  unarchiveIssueId: null,
};

function findVisibleActiveIssue(issues: Issue[], activeIssues: Issue[], activeIssueId: string | null) {
  if (!activeIssueId) {
    return activeIssues[0] ?? null;
  }

  const directIssue = activeIssues.find((issue) => issue.id === activeIssueId);
  if (directIssue) {
    return directIssue;
  }

  const issueIndex = issues.findIndex((issue) => issue.id === activeIssueId);
  if (issueIndex < 0) {
    return activeIssues[0] ?? null;
  }

  return (
    issues.slice(issueIndex + 1).find((issue) => !issue.archived_at) ??
    [...issues.slice(0, issueIndex)].reverse().find((issue) => !issue.archived_at) ??
    null
  );
}

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
  const activeIssues = useMemo(() => state?.issues.filter((issue) => !issue.archived_at) ?? [], [state?.issues]);
  const archivedIssues = useMemo(() => state?.issues.filter((issue) => issue.archived_at) ?? [], [state?.issues]);
  const activeIssue = useMemo(
    () => findVisibleActiveIssue(state?.issues ?? [], activeIssues, state?.room.active_issue_id ?? null),
    [activeIssues, state],
  );
  const voters = state?.participants.filter((participant) => !participant.is_spectator) ?? [];
  const voterIds = useMemo(() => new Set(voters.map((participant) => participant.id)), [voters]);
  const activeVotes = useMemo(
    () => state?.votes.filter((vote) => vote.issue_id === activeIssue?.id && voterIds.has(vote.participant_id)) ?? [],
    [activeIssue?.id, state?.votes, voterIds],
  );
  const currentVote = activeVotes.find((vote) => vote.participant_id === currentParticipant?.id) ?? null;
  const summary = state?.room.revealed ? voteSummary(activeVotes) : null;
  const voteGroups = state?.room.revealed ? distribution(activeVotes) : {};

  const showError = useCallback((error: unknown, fallbackMessage: string) => {
    setNotice({ kind: "error", message: translateError(error, t, fallbackMessage) });
  }, [t]);

  const setPending = useCallback((patch: Partial<PendingSync>) => {
    setPendingSync((current) => ({ ...current, ...patch }));
  }, []);

  const loadRoom = useCallback(async (code: string) => {
    const normalizedCode = normalizeCode(code);
    const savedParticipantToken = localStorage.getItem(participantKey(normalizedCode));
    const savedHostToken = localStorage.getItem(hostKey(normalizedCode));
    const roomState = await loadRoomState(normalizedCode, {
      hostToken: savedHostToken,
      participantToken: savedParticipantToken,
    });

    setState(roomState);
    setRoomUrl(roomState.room.code);

    const existingParticipant =
      roomState.participants.find((participant) => participant.token === savedParticipantToken) ?? null;
    setCurrentParticipant(existingParticipant);
    setHostToken(savedHostToken);

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
    if (!code) {
      return;
    }

    const normalizedCode = normalizeCode(code);
    const hasStoredRoomAuth =
      Boolean(localStorage.getItem(participantKey(normalizedCode))) || Boolean(localStorage.getItem(hostKey(normalizedCode)));

    if (!hasStoredRoomAuth) {
      return;
    }

    setLoading(true);
    loadRoom(normalizedCode)
      .catch((error) => showError(error, t("error.loadRoom")))
      .finally(() => setLoading(false));
  }, [loadRoom, showError, t]);

  useEffect(() => {
    if (!state) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshRoomState();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshRoomState, state]);

  useEffect(() => {
    if (!currentParticipant) {
      return;
    }

    const interval = window.setInterval(() => {
      void sendParticipantHeartbeat(currentParticipant.id, currentParticipant.token);
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

      localStorage.setItem(participantKey(result.state.room.code), result.participantToken);
      localStorage.setItem(hostKey(result.state.room.code), result.hostToken);
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

      localStorage.setItem(participantKey(result.room.code), result.participantToken);
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
      await submitVote(state.room.id, activeIssue.id, currentParticipant.id, currentParticipant.token, value);
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
    if (!state || !isHost || !hostToken) {
      return;
    }

    const wasRevealed = state.room.revealed;

    setNotice(null);
    setPending({ revealVotes: true });
    setState((current) => (current ? { ...current, room: { ...current.room, revealed: true } } : current));

    try {
      await revealRoomVotes(state.room.id, hostToken);
      await loadRoom(state.room.code);
    } catch (error) {
      setState((current) => (current ? { ...current, room: { ...current.room, revealed: wasRevealed } } : current));
      showError(error, t("error.revealVotes"));
    } finally {
      setPending({ revealVotes: false });
    }
  }, [hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const resetVoting = useCallback(async () => {
    if (!state || !activeIssue || !isHost || !hostToken) {
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
      await resetIssueVoting(state.room.id, activeIssue.id, hostToken);
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
  }, [activeIssue, hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const addIssue = useCallback(async (details: IssueDetailsInput) => {
    if (!state || !isHost || !hostToken) {
      return false;
    }

    setNotice(null);
    setPending({ addIssue: true });

    try {
      const issue = await createIssue(state.room.id, details, hostToken);
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
  }, [hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const editIssue = useCallback(async (issue: Issue, details: IssueDetailsInput) => {
    if (!state || !isHost || !hostToken) {
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
      const updatedIssue = await updateIssueDetails(issue.id, details, hostToken);
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
  }, [hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const deleteIssue = useCallback(async (issue: Issue) => {
    if (!state || !isHost || !hostToken) {
      return;
    }

    const previousState = state;
    const currentActiveIssues = state.issues.filter((item) => !item.archived_at);
    const issueIndex = currentActiveIssues.findIndex((item) => item.id === issue.id);
    const nextIssue = issueIndex >= 0 ? currentActiveIssues[issueIndex + 1] ?? currentActiveIssues[issueIndex - 1] ?? null : null;
    const isDeletingActiveIssue = state.room.active_issue_id === issue.id;
    const nextActiveIssueId = isDeletingActiveIssue ? nextIssue?.id ?? null : state.room.active_issue_id;

    setNotice(null);
    setPending({ deleteIssueId: issue.id });
    setState((current) =>
      current
        ? {
            ...current,
            room: isDeletingActiveIssue
              ? { ...current.room, active_issue_id: nextActiveIssueId, revealed: false }
              : current.room,
            issues: current.issues.filter((item) => item.id !== issue.id),
            votes: current.votes.filter((vote) => vote.issue_id !== issue.id),
          }
        : current,
    );

    try {
      await deleteIssueRequest(state.room.id, issue.id, hostToken, isDeletingActiveIssue ? nextActiveIssueId : undefined);
      await loadRoom(state.room.code);
    } catch (error) {
      setState(previousState);
      showError(error, t("error.deleteStory"));
    } finally {
      setPending({ deleteIssueId: null });
    }
  }, [hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const deleteParticipant = useCallback(async (participant: Participant) => {
    if (!state || !isHost || !hostToken || participant.id === currentParticipant?.id) {
      return;
    }

    const previousState = state;

    setNotice(null);
    setPending({ deleteParticipantId: participant.id });
    setState((current) =>
      current
        ? {
            ...current,
            participants: current.participants.filter((item) => item.id !== participant.id),
            votes: current.votes.filter((vote) => vote.participant_id !== participant.id),
          }
        : current,
    );

    try {
      await deleteParticipantRequest(state.room.id, participant.id, hostToken);
      await loadRoom(state.room.code);
    } catch (error) {
      setState(previousState);
      showError(error, t("error.deleteParticipant"));
    } finally {
      setPending({ deleteParticipantId: null });
    }
  }, [currentParticipant?.id, hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const switchObserverMode = useCallback(async () => {
    if (!state || !currentParticipant) {
      return;
    }

    const nextIsSpectator = !currentParticipant.is_spectator;
    const previousState = state;
    const previousParticipant = currentParticipant;

    setNotice(null);
    setPending({ observerMode: true });
    setCurrentParticipant((participant) => (participant ? { ...participant, is_spectator: nextIsSpectator } : participant));
    setState((current) =>
      current
        ? {
            ...current,
            participants: current.participants.map((participant) =>
              participant.id === currentParticipant.id ? { ...participant, is_spectator: nextIsSpectator } : participant,
            ),
            votes: nextIsSpectator && activeIssue
              ? current.votes.filter(
                  (vote) => !(vote.issue_id === activeIssue.id && vote.participant_id === currentParticipant.id),
                )
              : current.votes,
          }
        : current,
    );

    try {
      await Promise.all([
        updateParticipantSpectatorMode(currentParticipant.id, currentParticipant.token, nextIsSpectator),
        nextIsSpectator && activeIssue
          ? deleteParticipantIssueVote(activeIssue.id, currentParticipant.id, currentParticipant.token)
          : Promise.resolve(),
      ]);
      await loadRoom(state.room.code);
      setNotice({ kind: "success", message: nextIsSpectator ? t("notice.observerMode") : t("notice.voterMode") });
    } catch (error) {
      setCurrentParticipant(previousParticipant);
      setState(previousState);
      showError(error, t("error.updateParticipantMode"));
    } finally {
      setPending({ observerMode: false });
    }
  }, [activeIssue, currentParticipant, loadRoom, setPending, showError, state, t]);

  const archiveIssue = useCallback(async (issue: Issue) => {
    if (!state || !isHost || !hostToken) {
      return;
    }

    const archivedAt = new Date().toISOString();
    const previousState = state;
    const currentActiveIssues = state.issues.filter((item) => !item.archived_at);
    const issueIndex = currentActiveIssues.findIndex((item) => item.id === issue.id);
    const nextIssue = issueIndex >= 0 ? currentActiveIssues[issueIndex + 1] ?? currentActiveIssues[issueIndex - 1] ?? null : null;
    const isArchivingActiveIssue = state.room.active_issue_id === issue.id;
    const nextActiveIssueId = isArchivingActiveIssue ? nextIssue?.id ?? null : state.room.active_issue_id;

    setNotice(null);
    setPending({ archiveIssueId: issue.id });
    setState((current) =>
      current
        ? {
            ...current,
            room: isArchivingActiveIssue
              ? { ...current.room, active_issue_id: nextActiveIssueId, revealed: false }
              : current.room,
            issues: current.issues.map((item) => (item.id === issue.id ? { ...item, archived_at: archivedAt } : item)),
          }
        : current,
    );

    try {
      await archiveIssueRequest(state.room.id, issue.id, hostToken, isArchivingActiveIssue ? nextActiveIssueId : undefined);
      await loadRoom(state.room.code);
    } catch (error) {
      setState(previousState);
      showError(error, t("error.archiveStory"));
    } finally {
      setPending({ archiveIssueId: null });
    }
  }, [hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const archiveEstimatedIssues = useCallback(async () => {
    if (!state || !isHost || !hostToken) {
      return;
    }

    const archivedAt = new Date().toISOString();
    const previousState = state;
    const estimatedActiveIssues = activeIssues.filter((issue) => issue.estimate);

    if (estimatedActiveIssues.length === 0) {
      return;
    }

    const estimatedIssueIds = new Set(estimatedActiveIssues.map((issue) => issue.id));
    const isArchivingActiveIssue = state.room.active_issue_id ? estimatedIssueIds.has(state.room.active_issue_id) : false;
    const activeIssueIndex = activeIssues.findIndex((issue) => issue.id === state.room.active_issue_id);
    const remainingActiveIssues = activeIssues.filter((issue) => !estimatedIssueIds.has(issue.id));
    const nextActiveIssue =
      isArchivingActiveIssue && activeIssueIndex >= 0
        ? remainingActiveIssues.find((issue) => issue.position > activeIssues[activeIssueIndex].position) ??
          [...remainingActiveIssues].reverse().find((issue) => issue.position < activeIssues[activeIssueIndex].position) ??
          null
        : null;
    const nextActiveIssueId = isArchivingActiveIssue ? nextActiveIssue?.id ?? null : state.room.active_issue_id;

    setNotice(null);
    setPending({ archiveEstimatedIssues: true });
    setState((current) =>
      current
        ? {
            ...current,
            room: isArchivingActiveIssue
              ? { ...current.room, active_issue_id: nextActiveIssueId, revealed: false }
              : current.room,
            issues: current.issues.map((issue) =>
              estimatedIssueIds.has(issue.id) ? { ...issue, archived_at: archivedAt } : issue,
            ),
          }
        : current,
    );

    try {
      await archiveEstimatedIssuesRequest(state.room.id, hostToken, isArchivingActiveIssue ? nextActiveIssueId : undefined);
      await loadRoom(state.room.code);
    } catch (error) {
      setState(previousState);
      showError(error, t("error.archiveEstimatedStories"));
    } finally {
      setPending({ archiveEstimatedIssues: false });
    }
  }, [activeIssues, hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const unarchiveIssue = useCallback(async (issue: Issue) => {
    if (!state || !isHost || !hostToken) {
      return;
    }

    const previousIssue = issue;

    setNotice(null);
    setPending({ unarchiveIssueId: issue.id });
    setState((current) =>
      current
        ? {
            ...current,
            issues: current.issues.map((item) => (item.id === issue.id ? { ...item, archived_at: null } : item)),
          }
        : current,
    );

    try {
      const updatedIssue = await unarchiveIssueRequest(state.room.id, issue.id, hostToken);
      setState((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((item) => (item.id === issue.id ? updatedIssue : item)),
            }
          : current,
      );
      await loadRoom(state.room.code);
    } catch (error) {
      setState((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((item) => (item.id === issue.id ? previousIssue : item)),
            }
          : current,
      );
      showError(error, t("error.unarchiveStory"));
    } finally {
      setPending({ unarchiveIssueId: null });
    }
  }, [hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const importIssues = useCallback(async (details: IssueImportInput[]) => {
    if (!state || !isHost || !hostToken) {
      return false;
    }

    setNotice(null);
    setPending({ addIssue: true });

    try {
      const issues = await importIssuesRequest(state.room.id, details, hostToken);
      await loadRoom(state.room.code);
      setNotice({ kind: "success", message: t("notice.importedStories", { count: issues.length }) });
      return issues.length > 0;
    } catch (error) {
      showError(error, t("error.importStories"));
      return false;
    } finally {
      setPending({ addIssue: false });
    }
  }, [hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const activateIssue = useCallback(async (issue: Issue) => {
    if (!state || !isHost || !hostToken) {
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
      await activateIssueRequest(state.room.id, issue.id, hostToken);
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
  }, [hostToken, isHost, loadRoom, setPending, showError, state, t]);

  const setEstimate = useCallback(async (value: string) => {
    if (!activeIssue || !isHost || !hostToken) {
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
      await saveIssueEstimate(activeIssue.id, value, hostToken);
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
  }, [activeIssue, hostToken, isHost, loadRoom, setPending, showError, state, t]);

  return {
    state,
    activeIssues,
    archivedIssues,
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
    deleteIssue,
    deleteParticipant,
    switchObserverMode,
    archiveEstimatedIssues,
    archiveIssue,
    unarchiveIssue,
    importIssues,
    activateIssue,
    setEstimate,
    refreshRoom,
  };
}
