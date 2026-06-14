import type { FormEvent } from "react";
import { Loader2, LogIn, Plus, Sparkles, UserPlus } from "lucide-react";
import type { Notice } from "../../../entities/room/model/types";
import { LanguageSelector } from "../../../shared/i18n/LanguageSelector";
import { useI18n } from "../../../shared/i18n";

type LobbyPageProps = {
  initialRoomCode: string;
  loading: boolean;
  notice: Notice | null;
  onCreateRoom: (roomName: string, participantName: string) => Promise<void>;
  onJoinRoom: (code: string, name: string, isSpectator: boolean) => Promise<void>;
};

export function LobbyPage({ initialRoomCode, loading, notice, onCreateRoom, onJoinRoom }: LobbyPageProps) {
  const { t } = useI18n();

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
      <div className="landing-header">
        <div className="brand-identity">
          <div className="brand-mark">
            <Sparkles size={24} aria-hidden="true" />
          </div>
          <span>{t("brand.name")}</span>
        </div>
        <LanguageSelector />
      </div>
      <section className="intro">
        <h1>{t("lobby.heading")}</h1>
        <p>{t("lobby.supporting")}</p>
        <div className="feature-strip">
          <span>{t("feature.realtimeRooms")}</span>
          <span>{t("feature.hiddenVotes")}</span>
          <span>{t("feature.storyQueue")}</span>
        </div>
      </section>

      <section className="entry-grid">
        <form className="panel" onSubmit={handleCreateRoom}>
          <div className="panel-heading">
            <UserPlus size={20} aria-hidden="true" />
            <h2>{t("action.createRoom")}</h2>
          </div>
          <label>
            {t("field.roomName")}
            <input name="roomName" placeholder={t("lobby.placeholderRoomName")} autoComplete="off" />
          </label>
          <label>
            {t("field.hostName")}
            <input name="hostName" placeholder={t("lobby.placeholderHostName")} autoComplete="name" required />
          </label>
          <button className="primary-action" type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            {t("action.createRoom")}
          </button>
        </form>

        <form className="panel" onSubmit={handleJoinRoom}>
          <div className="panel-heading">
            <LogIn size={20} aria-hidden="true" />
            <h2>{t("action.joinRoom")}</h2>
          </div>
          <label>
            {t("field.roomCode")}
            <input name="roomCode" placeholder={t("placeholder.roomCode")} defaultValue={initialRoomCode} autoComplete="off" required />
          </label>
          <label>
            {t("field.participantName")}
            <input name="participantName" placeholder={t("lobby.placeholderParticipantName")} autoComplete="name" required />
          </label>
          <label className="checkbox-line">
            <input name="isSpectator" type="checkbox" />
            {t("field.spectator")}
          </label>
          <button className="secondary-action" type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
            {t("action.joinRoom")}
          </button>
        </form>
      </section>

      {notice ? <p className={`notice ${notice.kind}`}>{notice.message}</p> : null}
    </main>
  );
}
