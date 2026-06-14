import { Check, Clipboard, Link } from "lucide-react";
import { useI18n } from "../../../shared/i18n";

type InviteCardProps = {
  code: string;
  copied: boolean;
  onCopyInviteLink: () => void;
};

export function InviteCard({ code, copied, onCopyInviteLink }: InviteCardProps) {
  const { t } = useI18n();

  return (
    <aside className="share-panel">
      <div className="share-card">
        <Link size={22} aria-hidden="true" />
        <h2>{t("label.inviteTeammates")}</h2>
        <p>{t("share.description")}</p>
        <div className="room-code">{code}</div>
        <button className="secondary-action" type="button" onClick={onCopyInviteLink}>
          {copied ? <Check size={18} aria-hidden="true" /> : <Clipboard size={18} aria-hidden="true" />}
          {copied ? t("action.copied") : t("action.copyLink")}
        </button>
      </div>
    </aside>
  );
}
