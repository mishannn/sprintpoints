import { Anchor, Badge, Box, Button, Center, Group, Loader, Paper, Progress, ScrollArea, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Coffee, ExternalLink, Eye, EyeOff, RefreshCcw } from "lucide-react";
import type { Issue, Participant, Room, Vote } from "../../../entities/room/model/types";
import { normalizeEstimate } from "../../../features/manage-issues/model/estimate";
import type { PendingSync } from "../../../features/room-session/model/useRoomSession";
import { useI18n } from "../../../shared/i18n";

type VoteSummary = {
  average: number;
  min: number;
  max: number;
} | null;

type VotingTableProps = {
  activeIssue: Issue | null;
  activeVotes: Vote[];
  currentParticipant: Participant;
  currentVote: Vote | null;
  isHost: boolean;
  issues: Issue[];
  pendingSync: PendingSync;
  participants: Participant[];
  room: Room;
  summary: VoteSummary;
  votersCount: number;
  voteGroups: Record<string, number>;
  onCastVote: (value: string) => void;
  onRevealVotes: () => void;
  onResetVoting: () => void;
  onSetEstimate: (value: string) => void;
};

function getExternalHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function VotingTable({
  activeIssue,
  activeVotes,
  currentParticipant,
  currentVote,
  isHost,
  issues,
  pendingSync,
  participants,
  room,
  summary,
  votersCount,
  voteGroups,
  onCastVote,
  onRevealVotes,
  onResetVoting,
  onSetEstimate,
}: VotingTableProps) {
  const { t } = useI18n();
  const activeDescription = activeIssue?.description ?? "";
  const activeLink = activeIssue?.link ?? "";
  const activeStoryLink = activeLink.trim() ? getExternalHref(activeLink.trim()) : null;
  const selectedRating = currentVote?.value ?? null;
  const matchingEstimateIssues = selectedRating
    ? issues.filter(
        (issue) =>
          issue.id !== activeIssue?.id &&
          issue.estimate !== null &&
          normalizeEstimate(issue.estimate) === normalizeEstimate(selectedRating),
      )
    : [];
  const votesByParticipantId = new Map(activeVotes.map((vote) => [vote.participant_id, vote]));
  const voterRows = participants
    .filter((participant) => !participant.is_spectator)
    .map((participant) => ({
      participant,
      vote: votesByParticipantId.get(participant.id) ?? null,
    }));

  return (
    <Paper component="section" withBorder p="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" gap="md">
          <Box>
            <Text c="dimmed" fz="xs" fw={900} tt="uppercase">
              {t("label.activeStory")}
            </Text>
            <Title order={2} fz={{ base: 24, md: 27 }}>
              {activeIssue?.title ?? t("state.noStorySelected")}
            </Title>
          </Box>
          <Badge variant="light" size="lg" leftSection={room.revealed ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}>
          {room.revealed ? t("state.revealed") : t("state.voting")}
          </Badge>
        </Group>

      {activeIssue && (activeDescription || activeStoryLink) ? (
          <Paper withBorder bg="gray.0" p="md">
            <Stack gap="md">
          {activeStoryLink ? (
                <Stack gap={4}>
                  <Text c="dimmed" fz="xs" fw={700} tt="uppercase">
                    {t("common.link")}
                  </Text>
                  <Anchor href={activeStoryLink} target="_blank" rel="noreferrer">
                    <Group gap={7} wrap="nowrap">
                {activeLink}
                <ExternalLink size={16} aria-hidden="true" />
                    </Group>
                  </Anchor>
                </Stack>
          ) : null}
          {activeDescription ? (
                <Stack gap={4}>
                  <Text c="dimmed" fz="xs" fw={700} tt="uppercase">
                    {t("common.description")}
                  </Text>
                  <Text lh={1.55} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {activeDescription}
                  </Text>
                </Stack>
          ) : null}
            </Stack>
          </Paper>
      ) : null}

        <SimpleGrid cols={{ base: 3, sm: 5, lg: 6 }} spacing="xs" aria-label={t("aria.voteCards")}>
        {room.card_set.map((card) => (
            <Button
            key={card}
            type="button"
              variant={currentVote?.value === card ? "light" : "default"}
              h={112}
              pos="relative"
            onClick={() => onCastVote(card)}
            disabled={!activeIssue || currentParticipant.is_spectator || pendingSync.observerMode || room.revealed}
              fullWidth
            aria-label={card}
          >
              <Center h="100%">
                {card === "Coffee" ? (
                  <Coffee size={34} strokeWidth={2.4} aria-hidden="true" />
                ) : (
                  <Text fz={28} fw={900}>
                    {card}
                  </Text>
                )}
              </Center>
              {pendingSync.voteValue === card ? <Loader size={12} pos="absolute" top={8} right={8} aria-hidden="true" /> : null}
            </Button>
        ))}
        </SimpleGrid>

        {selectedRating ? (
          <Paper withBorder bg="gray.0" p="md">
            <Stack gap="sm">
              <Group justify="space-between" gap="sm">
                <Text c="dimmed" fz="xs" fw={900} tt="uppercase">
                  {t("label.sameEstimate", { value: selectedRating })}
                </Text>
                <Badge variant="default">{matchingEstimateIssues.length}</Badge>
              </Group>
              {matchingEstimateIssues.length ? (
                <ScrollArea.Autosize mah={260} type="auto" offsetScrollbars>
                  <Stack gap="xs" pr={4}>
                    {matchingEstimateIssues.map((issue) => {
                      const link = issue.link ?? "";
                      const href = link.trim() ? getExternalHref(link.trim()) : null;

                      return (
                        <Paper key={issue.id} withBorder bg="white" p="sm">
                          <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
                            <Box miw={0}>
                              {issue.archived_at ? <Badge variant="light" mb={4}>{t("common.archived")}</Badge> : null}
                              <Text fw={650} lineClamp={2}>
                                {issue.title}
                              </Text>
                              {href ? (
                                <Anchor href={href} target="_blank" rel="noreferrer" fz="xs" c="dimmed">
                                  <Group gap={5} wrap="nowrap">
                                    <Text span truncate>
                                      {link}
                                    </Text>
                                    <ExternalLink size={13} aria-hidden="true" />
                                  </Group>
                                </Anchor>
                              ) : null}
                            </Box>
                          </Group>
                        </Paper>
                      );
                    })}
                  </Stack>
                </ScrollArea.Autosize>
              ) : (
                <Text c="dimmed" fw={700}>
                  {t("state.noMatchingEstimate")}
                </Text>
              )}
            </Stack>
          </Paper>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Paper withBorder bg="gray.0" p="md">
            <Text c="dimmed" fz="xs" fw={900} tt="uppercase">
              {t("common.votes")}
            </Text>
            <Text fw={800} fz={25}>
            {activeVotes.length}/{votersCount}
            </Text>
          </Paper>
          <Paper withBorder bg="gray.0" p="md">
            <Text c="dimmed" fz="xs" fw={900} tt="uppercase">
              {t("common.average")}
            </Text>
            <Text fw={800} fz={25}>
              {summary ? summary.average.toFixed(1) : "-"}
            </Text>
          </Paper>
          <Paper withBorder bg="gray.0" p="md">
            <Text c="dimmed" fz="xs" fw={900} tt="uppercase">
              {t("common.range")}
            </Text>
            <Text fw={800} fz={25}>
              {summary ? `${summary.min}-${summary.max}` : "-"}
            </Text>
          </Paper>
        </SimpleGrid>

      {room.revealed ? (
        <Stack gap="sm">
          <Paper withBorder bg="gray.0">
            <Stack gap={0}>
          {Object.entries(voteGroups).map(([value, count]) => (
                <Group key={value} gap="sm" p="sm" wrap="nowrap">
                  <Text fw={900} w={52}>
                    {value}
                  </Text>
                  <Progress value={(count / Math.max(1, activeVotes.length)) * 100} flex={1} />
                  <Text fw={900} w={34} ta="right">
                    {count}
                  </Text>
                </Group>
          ))}
            </Stack>
          </Paper>
          <Paper withBorder bg="gray.0" p="md">
            <Stack gap="sm">
              <Text c="dimmed" fz="xs" fw={900} tt="uppercase">
                {t("label.revealedVotes")}
              </Text>
              <Stack gap="xs">
                {voterRows.map(({ participant, vote }) => (
                  <Paper key={participant.id} withBorder bg="white" p="sm">
                    <Group justify="space-between" gap="md" wrap="nowrap">
                      <Text fw={650} truncate>
                        {participant.name}
                      </Text>
                      <Badge variant={vote ? "filled" : "default"}>{vote?.value ?? t("common.noVote")}</Badge>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      ) : (
          <Paper withBorder bg="gray.0" p="xl">
            <Center mih={130}>
              <Stack align="center" gap="xs">
                <EyeOff size={24} aria-hidden="true" />
                <Text c="dimmed" fw={800} ta="center">
                  {t("voting.hiddenResults")}
                </Text>
              </Stack>
            </Center>
          </Paper>
      )}

      {isHost ? (
          <Group align="stretch" gap="sm">
            <Button
            type="button"
            onClick={onRevealVotes}
            disabled={pendingSync.revealVotes || !activeVotes.length || (room.revealed && !pendingSync.revealVotes)}
              loading={pendingSync.revealVotes}
              leftSection={<Eye size={18} aria-hidden="true" />}
          >
            {t("action.reveal")}
            </Button>
            <Button
              variant="light"
            type="button"
            onClick={onResetVoting}
            disabled={pendingSync.resetVoting}
              loading={pendingSync.resetVoting}
              leftSection={<RefreshCcw size={18} aria-hidden="true" />}
          >
            {t("action.reset")}
            </Button>
            <Select
              value={activeIssue?.estimate ?? ""}
              onChange={(value) => onSetEstimate(value ?? "")}
              disabled={!activeIssue}
              aria-label={t("aria.finalEstimate")}
              placeholder={t("common.estimate")}
              data={room.card_set.map((card) => ({ value: card, label: card }))}
              rightSection={pendingSync.estimate ? <Loader size="xs" aria-hidden="true" /> : undefined}
              w={{ base: "100%", sm: 180 }}
            />
          </Group>
      ) : null}
      </Stack>
    </Paper>
  );
}
