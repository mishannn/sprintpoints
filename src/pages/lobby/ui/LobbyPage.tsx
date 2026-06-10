import type { FormEvent } from "react";
import { Loader2, LogIn, Plus, Sparkles, UserPlus } from "lucide-react";
import type { Notice } from "../../../entities/room/model/types";

type LobbyPageProps = {
  initialRoomCode: string;
  loading: boolean;
  notice: Notice | null;
  onCreateRoom: (roomName: string, participantName: string) => Promise<void>;
  onJoinRoom: (code: string, name: string, isSpectator: boolean) => Promise<void>;
};

export function LobbyPage({ initialRoomCode, loading, notice, onCreateRoom, onJoinRoom }: LobbyPageProps) {
  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    await onCreateRoom(String(form.get("roomName") ?? ""), String(form.get("hostName") ?? ""));
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    await onJoinRoom(
      String(form.get("roomCode") ?? ""),
      String(form.get("participantName") ?? ""),
      form.get("isSpectator") === "on",
    );
  }

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
        <p>Create an invite-only room, vote privately, reveal together, and keep story estimates visible for the whole session.</p>
        <div className="feature-strip">
          <span>Realtime rooms</span>
          <span>Hidden votes</span>
          <span>Story queue</span>
        </div>
      </section>

      <section className="entry-grid">
        <form className="panel" onSubmit={handleCreateRoom}>
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

        <form className="panel" onSubmit={handleJoinRoom}>
          <div className="panel-heading">
            <LogIn size={20} aria-hidden="true" />
            <h2>Join room</h2>
          </div>
          <label>
            Room code
            <input name="roomCode" placeholder="ABC123" defaultValue={initialRoomCode} autoComplete="off" required />
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
