import { useCallback, useState } from "react";
import { getRoomInviteUrl } from "../../../shared/lib/roomUrl";

export function useCopyInviteLink() {
  const [copied, setCopied] = useState(false);

  const copyInviteLink = useCallback(async (code: string) => {
    await navigator.clipboard.writeText(getRoomInviteUrl(code));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, []);

  return { copied, copyInviteLink };
}
