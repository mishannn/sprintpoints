import { Button, Code, Paper, Stack, Text, Title } from "@mantine/core";
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
    <Paper component="aside" withBorder p="lg">
      <Stack gap="md">
        <Link size={22} aria-hidden="true" />
        <Title order={2} fz="lg">
          {t("label.inviteTeammates")}
        </Title>
        <Text c="dimmed" lh={1.5}>
          {t("share.description")}
        </Text>
        <Code block fz={27} fw={900} ta="center" py="lg">
          {code}
        </Code>
        <Button variant="light" type="button" onClick={onCopyInviteLink} leftSection={copied ? <Check size={18} aria-hidden="true" /> : <Clipboard size={18} aria-hidden="true" />}>
          {copied ? t("action.copied") : t("action.copyLink")}
        </Button>
      </Stack>
    </Paper>
  );
}
