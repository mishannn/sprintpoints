import { useMemo, useState } from "react";
import { ActionIcon, Badge, Box, Button, Center, Group, Loader, Modal, Paper, ScrollArea, Stack, Text, TextInput, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { Archive, ArchiveRestore, Crown, ExternalLink, ListChecks, Pencil, Search, Trash2, Users, X } from "lucide-react";
import type { Issue, Participant, Vote } from "../../../entities/room/model/types";
import type { IssueDetailsInput, IssueImportInput } from "../../../features/manage-issues/model/issues";
import { matchesIssueQuery } from "../../../features/manage-issues/model/issueFilter";
import type { PendingSync } from "../../../features/room-session/model/useRoomSession";
import { useI18n } from "../../../shared/i18n";
import { IssuesOverlay } from "./IssuesOverlay";

type RoomSidebarProps = {
  activeIssue: Issue | null;
  activeVotes: Vote[];
  archivedIssues: Issue[];
  currentParticipant: Participant;
  isHost: boolean;
  issues: Issue[];
  ownerId: string | null;
  pendingSync: PendingSync;
  participants: Participant[];
  roomName: string;
  onActivateIssue: (issue: Issue) => void;
  onAddIssue: (details: IssueDetailsInput) => Promise<boolean>;
  onArchiveIssue: (issue: Issue) => Promise<void>;
  onArchiveIssues: (issues: Issue[]) => Promise<boolean>;
  onDeleteIssues: (issues: Issue[]) => Promise<boolean>;
  onDeleteParticipant: (participant: Participant) => Promise<void>;
  onTransferOwnership: (participant: Participant) => Promise<void>;
  onEditIssue: (issue: Issue, details: IssueDetailsInput) => Promise<boolean>;
  onImportIssues: (details: IssueImportInput[]) => Promise<boolean>;
  onUnarchiveIssue: (issue: Issue) => Promise<void>;
};

function getExternalHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function RoomSidebar({
  activeIssue,
  activeVotes,
  archivedIssues,
  currentParticipant,
  isHost,
  issues,
  ownerId,
  pendingSync,
  participants,
  roomName,
  onActivateIssue,
  onAddIssue,
  onArchiveIssue,
  onArchiveIssues,
  onDeleteIssues,
  onDeleteParticipant,
  onTransferOwnership,
  onEditIssue,
  onImportIssues,
  onUnarchiveIssue,
}: RoomSidebarProps) {
  const { t } = useI18n();
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isIssuesOverlayOpen, setIsIssuesOverlayOpen] = useState(false);
  const [issueQuery, setIssueQuery] = useState("");
  const visibleIssues = useMemo(
    () => issues.filter((issue) => matchesIssueQuery(issue, issueQuery)),
    [issueQuery, issues],
  );

  const handleDeleteParticipant = (participant: Participant) => {
    if (!window.confirm(t("confirm.deleteParticipant", { name: participant.name }))) {
      return;
    }

    void onDeleteParticipant(participant);
  };

  const handleTransferOwnership = (participant: Participant) => {
    if (!window.confirm(t("confirm.transferOwnership", { name: participant.name }))) {
      return;
    }

    void onTransferOwnership(participant);
  };

  const handleArchiveIssue = (issue: Issue) => {
    void onArchiveIssue(issue);
  };

  const handleUnarchiveIssue = (issue: Issue) => {
    void onUnarchiveIssue(issue);
  };

  return (
    <Stack component="aside" gap="lg">
      <Paper withBorder p="lg">
        <Stack gap="md">
          <Group gap="xs">
            <Users size={18} aria-hidden="true" />
            <Title order={2} fz="lg">
              {t("label.people")}
            </Title>
          </Group>
          {participants.map((participant) => {
            const voted = activeVotes.some((vote) => vote.participant_id === participant.id);
            return (
              <Paper key={participant.id} bg="gray.0" p="sm" radius="md">
                <Group justify="space-between" gap="sm" wrap="nowrap">
                  <Box miw={0}>
                    <Group gap={6} wrap="nowrap">
                      {participant.id === ownerId ? (
                        <Tooltip label={t("participant.host")}>
                          <Crown size={14} aria-label={t("participant.host")} style={{ flex: "0 0 auto", color: "var(--mantine-color-yellow-6)" }} />
                        </Tooltip>
                      ) : null}
                      <Text fw={700} truncate>
                        {participant.name}
                      </Text>
                    </Group>
                    <Text c="dimmed" fz="xs" fw={700} truncate>
                    {participant.is_spectator ? t("participant.spectator") : voted ? t("participant.voted") : t("participant.waiting")}
                    </Text>
                  </Box>
                  <Group gap={5} wrap="nowrap">
                {!participant.is_spectator ? (
                    <Box
                      aria-label={voted ? t("participant.voted") : t("aria.notVoted")}
                      bg={voted ? "gray.8" : "gray.3"}
                      h={12}
                      w={12}
                      style={{ borderRadius: "50%", flex: "0 0 auto" }}
                    />
                ) : null}
                    {isHost && participant.id !== currentParticipant.id ? (
                      <>
                        {participant.id !== ownerId ? (
                          <Tooltip label={t("action.transferOwnership")}>
                            <ActionIcon
                              variant="subtle"
                              color="yellow"
                              type="button"
                              size="sm"
                              onClick={() => handleTransferOwnership(participant)}
                              aria-label={t("action.transferOwnership")}
                              disabled={pendingSync.transferOwnershipId === participant.id}
                            >
                              {pendingSync.transferOwnershipId === participant.id ? (
                                <Loader size="xs" aria-hidden="true" />
                              ) : (
                                <Crown size={14} aria-hidden="true" />
                              )}
                            </ActionIcon>
                          </Tooltip>
                        ) : null}
                        <Tooltip label={t("action.deleteParticipant")}>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            type="button"
                            size="sm"
                            onClick={() => handleDeleteParticipant(participant)}
                            aria-label={t("action.deleteParticipant")}
                            disabled={pendingSync.deleteParticipantId === participant.id}
                          >
                            {pendingSync.deleteParticipantId === participant.id ? (
                              <Loader size="xs" aria-hidden="true" />
                            ) : (
                              <Trash2 size={14} aria-hidden="true" />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      </>
                    ) : null}
                  </Group>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      </Paper>

      <Paper withBorder p="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center" gap="sm">
            <Group gap="xs">
              <ListChecks size={18} aria-hidden="true" />
              <Title order={2} fz="lg">
                {t("label.stories")}
              </Title>
            </Group>
            <Tooltip label={t("action.manageStories")}>
              <ActionIcon
                variant="default"
                type="button"
                onClick={() => setIsIssuesOverlayOpen(true)}
                aria-label={t("action.manageStories")}
              >
                <Pencil size={17} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          </Group>

          <TextInput
            value={issueQuery}
            onChange={(event) => setIssueQuery(event.currentTarget.value)}
            placeholder={t("placeholder.searchStories")}
            aria-label={t("aria.searchStories")}
            leftSection={<Search size={16} aria-hidden="true" />}
            rightSection={
              issueQuery ? (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  type="button"
                  onClick={() => setIssueQuery("")}
                  aria-label={t("action.clearSearch")}
                >
                  <X size={14} aria-hidden="true" />
                </ActionIcon>
              ) : null
            }
          />

          {visibleIssues.length === 0 ? (
            <Center mih={80}>
              <Text c="dimmed" fw={700} fz="sm" ta="center">
                {issues.length === 0 ? t("state.noStories") : t("state.noSearchResults")}
              </Text>
            </Center>
          ) : (
            <ScrollArea.Autosize mah={520} type="auto">
              <Stack gap="xs">
                {visibleIssues.map((issue) => (
                  <Paper key={issue.id} withBorder bg={issue.id === activeIssue?.id ? "white" : "gray.0"} p="xs" radius="md">
                    <Stack gap={6}>
                      <UnstyledButton type="button" onClick={() => onActivateIssue(issue)} disabled={!isHost} p={6}>
                        <Text fw={500} lineClamp={2}>
                          {issue.title}
                        </Text>
                      </UnstyledButton>
                      {issue.estimate || isHost || pendingSync.activeIssueId === issue.id ? (
                        <Group justify="space-between" gap="xs" pl={6}>
                          <Group gap={6}>
                            {pendingSync.activeIssueId === issue.id ? <Loader size="xs" aria-hidden="true" /> : null}
                            {issue.estimate ? <Badge variant="default">{issue.estimate}</Badge> : null}
                          </Group>
                          {isHost ? (
                            <Tooltip label={issue.estimate ? t("action.archiveStory") : t("hint.archiveNeedsEstimate")}>
                              <ActionIcon
                                variant="default"
                                type="button"
                                onClick={() => handleArchiveIssue(issue)}
                                aria-label={t("action.archiveStory")}
                                disabled={
                                  !issue.estimate ||
                                  pendingSync.archiveIssueId === issue.id ||
                                  pendingSync.archiveIssues ||
                                  pendingSync.editIssueId === issue.id
                                }
                              >
                                {pendingSync.archiveIssueId === issue.id ? (
                                  <Loader size="xs" aria-hidden="true" />
                                ) : (
                                  <Archive size={16} aria-hidden="true" />
                                )}
                              </ActionIcon>
                            </Tooltip>
                          ) : null}
                        </Group>
                      ) : null}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Stack>
      </Paper>

      <Button
        variant="default"
        type="button"
        onClick={() => setIsArchiveOpen(true)}
        leftSection={<Archive size={18} aria-hidden="true" />}
        rightSection={<Badge variant="default">{archivedIssues.length}</Badge>}
      >
        {t("action.openArchive")}
      </Button>

      <IssuesOverlay
        activeIssueId={activeIssue?.id ?? null}
        isHost={isHost}
        isOpen={isIssuesOverlayOpen}
        issues={issues}
        pendingSync={pendingSync}
        roomName={roomName}
        onAddIssue={onAddIssue}
        onArchiveIssues={onArchiveIssues}
        onClose={() => setIsIssuesOverlayOpen(false)}
        onDeleteIssues={onDeleteIssues}
        onEditIssue={onEditIssue}
        onImportIssues={onImportIssues}
      />

      <Modal opened={isArchiveOpen} onClose={() => setIsArchiveOpen(false)} title={t("modal.archiveTitle")} size="lg">
        {archivedIssues.length ? (
          <ScrollArea.Autosize mah={520} type="auto">
            <Stack gap="xs" pr={4}>
              {archivedIssues.map((issue) => {
                const link = issue.link ?? "";

                return (
                  <Paper key={issue.id} withBorder bg="gray.0" p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
                        <Box miw={0}>
                          <Text fw={650} lineClamp={2}>
                            {issue.title}
                          </Text>
                          {link ? (
                            <Text c="dimmed" fz="xs" lineClamp={2}>
                              {link}
                            </Text>
                          ) : null}
                        </Box>
                        {issue.estimate ? <Badge variant="default">{issue.estimate}</Badge> : null}
                      </Group>
                      <Group justify="space-between" gap="xs">
                        <Text c="dimmed" fz="xs">
                          {issue.archived_at ? new Date(issue.archived_at).toLocaleDateString() : t("common.archive")}
                        </Text>
                        <Group gap={5}>
                          {link ? (
                            <Tooltip label={t("action.openStoryLink")}>
                              <ActionIcon component="a" variant="default" href={getExternalHref(link)} target="_blank" rel="noreferrer" aria-label={t("action.openStoryLink")}>
                                <ExternalLink size={16} aria-hidden="true" />
                              </ActionIcon>
                            </Tooltip>
                          ) : null}
                          {isHost ? (
                            <Tooltip label={t("action.unarchiveStory")}>
                              <ActionIcon
                                variant="default"
                                type="button"
                                onClick={() => handleUnarchiveIssue(issue)}
                                aria-label={t("action.unarchiveStory")}
                                disabled={pendingSync.unarchiveIssueId === issue.id}
                              >
                                {pendingSync.unarchiveIssueId === issue.id ? (
                                  <Loader size="xs" aria-hidden="true" />
                                ) : (
                                  <ArchiveRestore size={16} aria-hidden="true" />
                                )}
                              </ActionIcon>
                            </Tooltip>
                          ) : null}
                        </Group>
                      </Group>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        ) : (
          <Center mih={120}>
            <Text c="dimmed" fw={700}>
              {t("state.archiveEmpty")}
            </Text>
          </Center>
        )}
      </Modal>
    </Stack>
  );
}
