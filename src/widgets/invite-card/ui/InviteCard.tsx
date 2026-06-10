import { Check, Clipboard, Link } from "lucide-react";

type InviteCardProps = {
  code: string;
  copied: boolean;
  onCopyInviteLink: () => void;
};

export function InviteCard({ code, copied, onCopyInviteLink }: InviteCardProps) {
  return (
    <aside className="share-panel">
      <div className="share-card">
        <Link size={22} aria-hidden="true" />
        <h2>Invite teammates</h2>
        <p>Share the room code or copy the current link.</p>
        <div className="room-code">{code}</div>
        <button className="secondary-action" type="button" onClick={onCopyInviteLink}>
          {copied ? <Check size={18} aria-hidden="true" /> : <Clipboard size={18} aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </aside>
  );
}
