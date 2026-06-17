import type { FormEvent } from "react";
import { Alert, Badge, Box, Button, Checkbox, Container, Group, Loader, Paper, SimpleGrid, Stack, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
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
          <LanguageSelector />
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
