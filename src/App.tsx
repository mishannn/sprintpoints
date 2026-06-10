import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  Eye,
  EyeOff,
  Link,
  Loader2,
  LogIn,
  Plus,
  RefreshCcw,
  Settings,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./supabase";
import type { Issue, Participant, Room, Vote } from "./types";

const DEFAULT_CARDS = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "Coffee"];
const STORAGE_PREFIX = "planning-poker";

type RoomState = {
  room: Room;
  participants: Participant[];
  issues: Issue[];
  votes: Vote[];
};

type Notice = {
  kind: "error" | "success" | "info";
  message: string;
};

const makeToken = () => crypto.randomUUID();

const normalizeCode = (value: string) => value.trim().toUpperCase();

const getJoinCodeFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return normalizeCode(params.get("room") ?? "");
};

const setRoomUrl = (code: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  window.history.replaceState(null, "", url.toString());
};

const participantKey = (roomId: string) => `${STORAGE_PREFIX}:participant:${roomId}`;
const hostKey = (roomId: string) => `${STORAGE_PREFIX}:host:${roomId}`;

function numberFromVote(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function voteSummary(votes: Vote[]) {
  const numericVotes = votes.map((vote) => numberFromVote(vote.value)).filter((vote): vote is number => vote !== null);
  if (!numericVotes.length) {
    return null;
  }

  const total = numericVotes.reduce((sum, vote) => sum + vote, 0);
  return {
    average: total / numericVotes.length,
    min: Math.min(...numericVotes),
    max: Math.max(...numericVotes),
  };
}

function distribution(votes: Vote[]) {
  return votes.reduce<Record<string, number>>((groups, vote) => {
    groups[vote.value] = (groups[vote.value] ?? 0) + 1;
    return groups;
  }, {});
}

export function App() {
  const [state, setState] = useState<RoomState | null>(null);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");

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

  const loadRoom = useCallback(async (code: string) => {
    if (!supabase) {
      return;
    }

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", normalizeCode(code))
      .single();

    if (roomError || !room) {
      throw new Error("Room not found.");
    }

    const [{ data: participants, error: participantsError }, { data: issues, error: issuesError }, { data: votes, error: votesError }] =
      await Promise.all([
        supabase.from("participants").select("*").eq("room_id", room.id).order("created_at"),
        supabase.from("issues").select("*").eq("room_id", room.id).order("position"),
        supabase.from("votes").select("*").eq("room_id", room.id),
      ]);

    if (participantsError || issuesError || votesError) {
      throw new Error("Could not load the room state.");
    }

    setState({
      room,
      participants: participants ?? [],
      issues: issues ?? [],
      votes: votes ?? [],
    });
    setRoomUrl(room.code);

    const savedParticipantToken = localStorage.getItem(participantKey(room.id));
    const existingParticipant = participants?.find((participant) => participant.token === savedParticipantToken) ?? null;
    setCurrentParticipant(existingParticipant);
    setHostToken(localStorage.getItem(hostKey(room.id)));
  }, []);

  const refreshRoom = useCallback(async () => {
    if (!state) {
      return;
    }
    try {
      await loadRoom(state.room.code);
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not refresh the room." });
    }
  }, [loadRoom, state]);

  useEffect(() => {
    const code = getJoinCodeFromUrl();
    if (!code || !hasSupabaseConfig) {
      return;
    }

    setLoading(true);
    loadRoom(code)
      .catch((error) => setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not open room." }))
      .finally(() => setLoading(false));
  }, [loadRoom]);

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

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const roomName = String(form.get("roomName") ?? "").trim() || "Sprint planning";
    const participantName = String(form.get("hostName") ?? "").trim() || "Facilitator";
    const host = makeToken();
    const participantToken = makeToken();

    setLoading(true);
    setNotice(null);
    try {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .insert({ name: roomName, host_token: host, card_set: DEFAULT_CARDS })
        .select("*")
        .single();

      if (roomError || !room) {
        throw new Error("Could not create a room.");
      }

      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .insert({ room_id: room.id, name: participantName, token: participantToken })
        .select("*")
        .single();

      if (participantError || !participant) {
        throw new Error("Could not add the facilitator.");
      }

      const { data: issue, error: issueError } = await supabase
        .from("issues")
        .insert({ room_id: room.id, title: "First story", position: 1 })
        .select("*")
        .single();

      if (issueError || !issue) {
        throw new Error("Could not create the first story.");
      }

      const { data: updatedRoom, error: updateError } = await supabase
        .from("rooms")
        .update({ active_issue_id: issue.id })
        .eq("id", room.id)
        .select("*")
        .single();

      if (updateError || !updatedRoom) {
        throw new Error("Could not activate the first story.");
      }

      localStorage.setItem(participantKey(room.id), participantToken);
      localStorage.setItem(hostKey(room.id), host);
      setCurrentParticipant(participant);
      setHostToken(host);
      setState({ room: updatedRoom, participants: [participant], issues: [issue], votes: [] });
      setRoomUrl(room.code);
      setNotice({ kind: "success", message: "Room created." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not create the room." });
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const code = normalizeCode(String(form.get("roomCode") ?? ""));
    const name = String(form.get("participantName") ?? "").trim();
    const isSpectator = form.get("isSpectator") === "on";

    if (!code || !name) {
      setNotice({ kind: "error", message: "Enter a room code and your name." });
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      await loadRoom(code);
      const room = state?.room.code === code ? state.room : null;
      const { data: loadedRoom, error: roomError } = room
        ? { data: room, error: null }
        : await supabase.from("rooms").select("*").eq("code", code).single();

      if (roomError || !loadedRoom) {
        throw new Error("Room not found.");
      }

      const token = makeToken();
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .insert({ room_id: loadedRoom.id, name, token, is_spectator: isSpectator })
        .select("*")
        .single();

      if (participantError || !participant) {
        throw new Error("Could not join the room.");
      }

      localStorage.setItem(participantKey(loadedRoom.id), token);
      setCurrentParticipant(participant);
      setRoomUrl(loadedRoom.code);
      await loadRoom(loadedRoom.code);
      setNotice({ kind: "success", message: "Joined the room." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not join the room." });
    } finally {
      setLoading(false);
    }
  }

  async function castVote(value: string) {
    if (!supabase || !state || !activeIssue || !currentParticipant || currentParticipant.is_spectator) {
      return;
    }

    setNotice(null);
    const { error } = await supabase.from("votes").upsert(
      {
        room_id: state.room.id,
        issue_id: activeIssue.id,
        participant_id: currentParticipant.id,
        value,
      },
      { onConflict: "issue_id,participant_id" },
    );

    if (error) {
      setNotice({ kind: "error", message: "Could not save your vote." });
    }
  }

  async function revealVotes() {
    if (!supabase || !state || !isHost) {
      return;
    }

    const { error } = await supabase.from("rooms").update({ revealed: true }).eq("id", state.room.id);
    if (error) {
      setNotice({ kind: "error", message: "Could not reveal votes." });
    }
  }

  async function resetVoting() {
    if (!supabase || !state || !activeIssue || !isHost) {
      return;
    }

    const [{ error: voteError }, { error: roomError }] = await Promise.all([
      supabase.from("votes").delete().eq("issue_id", activeIssue.id),
      supabase.from("rooms").update({ revealed: false }).eq("id", state.room.id),
    ]);

    if (voteError || roomError) {
      setNotice({ kind: "error", message: "Could not reset voting." });
    }
  }

  async function addIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !state || !isHost || !newIssueTitle.trim()) {
      return;
    }

    const nextPosition = Math.max(0, ...state.issues.map((issue) => issue.position)) + 1;
    const { data: issue, error } = await supabase
      .from("issues")
      .insert({ room_id: state.room.id, title: newIssueTitle.trim(), position: nextPosition })
      .select("*")
      .single();

    if (error || !issue) {
      setNotice({ kind: "error", message: "Could not add the story." });
      return;
    }

    setNewIssueTitle("");
    await supabase.from("rooms").update({ active_issue_id: issue.id, revealed: false }).eq("id", state.room.id);
  }

  async function activateIssue(issue: Issue) {
    if (!supabase || !state || !isHost) {
      return;
    }

    const { error } = await supabase.from("rooms").update({ active_issue_id: issue.id, revealed: false }).eq("id", state.room.id);
    if (error) {
      setNotice({ kind: "error", message: "Could not switch story." });
    }
  }

  async function setEstimate(value: string) {
    if (!supabase || !state || !activeIssue || !isHost) {
      return;
    }

    const { error } = await supabase.from("issues").update({ estimate: value }).eq("id", activeIssue.id);
    if (error) {
      setNotice({ kind: "error", message: "Could not save the estimate." });
    }
  }

  async function copyInviteLink() {
    if (!state) {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("room", state.room.code);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!hasSupabaseConfig) {
    return (
      <main className="shell centered">
        <section className="setup-panel">
          <div className="brand-mark">
            <Sparkles size={26} aria-hidden="true" />
          </div>
          <h1>Connect Supabase to start planning</h1>
          <p>
            Create a cloud Supabase project, run the SQL migration in <code>supabase/migrations</code>, then copy{" "}
            <code>.env.example</code> to <code>.env</code> and set your project URL and anon key.
          </p>
        </section>
      </main>
    );
  }

  if (!state || !currentParticipant) {
    return (
      <main className="shell landing">
        <section className="intro">
          <div className="brand-row">
            <div className="brand-mark">
              <Sparkles size={24} aria-hidden="true" />
            </div>
            <span>Planning Poker</span>
          </div>
          <h1>Estimate sprint work with a shared realtime deck.</h1>
          <p>
            Create an invite-only room, vote privately, reveal together, and keep story estimates visible for the whole session.
          </p>
          <div className="feature-strip">
            <span>Realtime rooms</span>
            <span>Hidden votes</span>
            <span>Story queue</span>
          </div>
        </section>

        <section className="entry-grid">
          <form className="panel" onSubmit={createRoom}>
            <div className="panel-heading">
              <UserPlus size={20} aria-hidden="true" />
              <h2>Create room</h2>
            </div>
            <label>
              Room name
              <input name="roomName" placeholder="Sprint planning" autoComplete="off" />
            </label>
            <label>
              Your name
              <input name="hostName" placeholder="Alex" autoComplete="name" required />
            </label>
            <button className="primary-action" type="submit" disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
              Create room
            </button>
          </form>

          <form className="panel" onSubmit={joinRoom}>
            <div className="panel-heading">
              <LogIn size={20} aria-hidden="true" />
              <h2>Join room</h2>
            </div>
            <label>
              Room code
              <input name="roomCode" placeholder="ABC123" defaultValue={getJoinCodeFromUrl()} autoComplete="off" required />
            </label>
            <label>
              Your name
              <input name="participantName" placeholder="Taylor" autoComplete="name" required />
            </label>
            <label className="checkbox-line">
              <input name="isSpectator" type="checkbox" />
              Join as spectator
            </label>
            <button className="secondary-action" type="submit" disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
              Join room
            </button>
          </form>
        </section>

        {notice ? <p className={`notice ${notice.kind}`}>{notice.message}</p> : null}
      </main>
    );
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <span className="eyebrow">Room {state.room.code}</span>
          <h1>{state.room.name}</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={copyInviteLink} title="Copy invite link" aria-label="Copy invite link">
            {copied ? <Check size={19} aria-hidden="true" /> : <Clipboard size={19} aria-hidden="true" />}
          </button>
          <button className="ghost-action" type="button" onClick={refreshRoom}>
            <RefreshCcw size={17} aria-hidden="true" />
            Sync
          </button>
        </div>
      </header>

      {notice ? <p className={`notice ${notice.kind}`}>{notice.message}</p> : null}

      <section className="room-layout">
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="section-title">
              <Users size={18} aria-hidden="true" />
              <h2>People</h2>
            </div>
            <div className="people-list">
              {state.participants.map((participant) => {
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
              {state.issues.map((issue) => (
                <button
                  type="button"
                  className={`issue-row ${issue.id === activeIssue?.id ? "active" : ""}`}
                  key={issue.id}
                  onClick={() => activateIssue(issue)}
                  disabled={!isHost}
                >
                  <span>{issue.title}</span>
                  {issue.estimate ? <strong>{issue.estimate}</strong> : null}
                </button>
              ))}
            </div>
            {isHost ? (
              <form className="add-issue" onSubmit={addIssue}>
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

        <section className="table">
          <div className="story-header">
            <div>
              <span className="eyebrow">Active story</span>
              <h2>{activeIssue?.title ?? "No story selected"}</h2>
            </div>
            <div className="story-state">
              {state.room.revealed ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
              {state.room.revealed ? "Revealed" : "Voting"}
            </div>
          </div>

          <div className="cards-grid" aria-label="Vote cards">
            {state.room.card_set.map((card) => (
              <button
                key={card}
                type="button"
                className={`card-button ${currentVote?.value === card ? "selected" : ""}`}
                onClick={() => castVote(card)}
                disabled={!activeIssue || currentParticipant.is_spectator || state.room.revealed}
              >
                {card}
              </button>
            ))}
          </div>

          <div className="status-grid">
            <div className="metric">
              <span>Votes</span>
              <strong>
                {activeVotes.length}/{voters.length}
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

          {state.room.revealed ? (
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
              <button className="primary-action" type="button" onClick={revealVotes} disabled={!activeVotes.length || state.room.revealed}>
                <Eye size={18} aria-hidden="true" />
                Reveal
              </button>
              <button className="secondary-action" type="button" onClick={resetVoting}>
                <RefreshCcw size={18} aria-hidden="true" />
                Reset
              </button>
              <select
                value={activeIssue?.estimate ?? ""}
                onChange={(event) => setEstimate(event.target.value)}
                disabled={!activeIssue}
                aria-label="Final estimate"
              >
                <option value="">Estimate</option>
                {state.room.card_set.map((card) => (
                  <option key={card} value={card}>
                    {card}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </section>

        <aside className="share-panel">
          <div className="share-card">
            <Link size={22} aria-hidden="true" />
            <h2>Invite teammates</h2>
            <p>Share the room code or copy the current link.</p>
            <div className="room-code">{state.room.code}</div>
            <button className="secondary-action" type="button" onClick={copyInviteLink}>
              {copied ? <Check size={18} aria-hidden="true" /> : <Clipboard size={18} aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}
