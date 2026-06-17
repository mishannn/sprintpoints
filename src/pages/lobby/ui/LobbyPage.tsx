import type { FormEvent } from "react";
import { ActionIcon, Alert, Badge, Box, Button, Checkbox, Container, Group, Loader, Paper, SimpleGrid, Stack, Text, TextInput, ThemeIcon, Title, Tooltip } from "@mantine/core";
import { LogIn, Plus, Sparkles, UserPlus } from "lucide-react";
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

function GitHubMark({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56v-2.02c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18A11 11 0 0 1 12 6.18c.98 0 1.95.13 2.87.39 2.19-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.18c0 .31.21.67.79.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function LobbyPage({ initialRoomCode, loading, notice, onCreateRoom, onJoinRoom }: LobbyPageProps) {
  const { t } = useI18n();
  const noticeColor = notice?.kind === "error" ? "red" : notice?.kind === "success" ? "gray" : "gray";

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
    <Box component="main" bg="gray.0" mih="100vh" py={{ base: "lg", md: 36 }} px={{ base: "md", md: 36 }}>
      <Container size={1180} px={0}>
        <Group justify="space-between" gap="md" mb={36}>
          <Group gap="sm">
            <ThemeIcon size={48} radius="md" color="gray">
            <Sparkles size={24} aria-hidden="true" />
            </ThemeIcon>
            <Text fw={800} c="gray.8">
              {t("brand.name")}
            </Text>
          </Group>
          <Group gap="xs">
            <LanguageSelector />
            <Tooltip label={t("action.openGitHubRepository")}>
              <ActionIcon
                component="a"
                variant="default"
                size={36}
                href="https://github.com/mishannn/sprintpoints"
                target="_blank"
                rel="noreferrer"
                aria-label={t("action.openGitHubRepository")}
              >
                <GitHubMark />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={36} verticalSpacing={28}>
          <Stack gap="xl">
            <Stack gap="md">
              <Title order={1} fz={{ base: 44, sm: 58, md: 74 }} lh={0.96} maw={620}>
                {t("lobby.heading")}
              </Title>
              <Text c="dimmed" fz="lg" lh={1.6} maw={560}>
                {t("lobby.supporting")}
              </Text>
            </Stack>
            <Group gap="xs">
              <Badge variant="outline" color="gray" size="lg">
                {t("feature.realtimeRooms")}
              </Badge>
              <Badge variant="outline" color="gray" size="lg">
                {t("feature.hiddenVotes")}
              </Badge>
              <Badge variant="outline" color="gray" size="lg">
                {t("feature.storyQueue")}
              </Badge>
            </Group>
          </Stack>

          <Stack gap="md">
            <Paper component="form" withBorder shadow="xl" p="xl" onSubmit={handleCreateRoom}>
              <Stack gap="md">
                <Group gap="xs" c="gray.8">
                  <UserPlus size={20} aria-hidden="true" />
                  <Title order={2} fz="lg">
                    {t("action.createRoom")}
                  </Title>
                </Group>
                <TextInput name="roomName" label={t("field.roomName")} placeholder={t("lobby.placeholderRoomName")} autoComplete="off" />
                <TextInput name="hostName" label={t("field.hostName")} placeholder={t("lobby.placeholderHostName")} autoComplete="name" required />
                <Button type="submit" disabled={loading} leftSection={loading ? <Loader size="xs" color="white" /> : <Plus size={18} aria-hidden="true" />} fullWidth>
                  {t("action.createRoom")}
                </Button>
              </Stack>
            </Paper>

            <Paper component="form" withBorder shadow="xl" p="xl" onSubmit={handleJoinRoom}>
              <Stack gap="md">
                <Group gap="xs" c="gray.8">
                  <LogIn size={20} aria-hidden="true" />
                  <Title order={2} fz="lg">
                    {t("action.joinRoom")}
                  </Title>
                </Group>
                <TextInput name="roomCode" label={t("field.roomCode")} placeholder={t("placeholder.roomCode")} defaultValue={initialRoomCode} autoComplete="off" required />
                <TextInput name="participantName" label={t("field.participantName")} placeholder={t("lobby.placeholderParticipantName")} autoComplete="name" required />
                <Checkbox name="isSpectator" label={t("field.spectator")} />
                <Button
                  type="submit"
                  disabled={loading}
                  variant="light"
                  leftSection={loading ? <Loader size="xs" /> : <LogIn size={18} aria-hidden="true" />}
                  fullWidth
                >
                  {t("action.joinRoom")}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        </SimpleGrid>

        {notice ? (
          <Alert color={noticeColor} mt="lg">
            {notice.message}
          </Alert>
        ) : null}
      </Container>
    </Box>
  );
}
