import { useState } from "react";
import { ActionIcon, Badge, Box, Button, Center, Group, Loader, Modal, Paper, ScrollArea, Stack, Text, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { Archive, ArchiveRestore, Download, ExternalLink, Pencil, Plus, Settings, Trash2, Upload, Users } from "lucide-react";
import type { Issue, Participant, Vote } from "../../../entities/room/model/types";
import type { IssueDetailsInput, IssueImportInput } from "../../../features/manage-issues/model/issues";
import { downloadJiraCsv } from "../../../features/manage-issues/model/jiraCsv";
import type { PendingSync } from "../../../features/room-session/model/useRoomSession";
import { useI18n } from "../../../shared/i18n";
import { AddIssueModal } from "./AddIssueModal";
import { ImportIssuesModal } from "./ImportIssuesModal";

type RoomSidebarProps = {
  activeIssue: Issue | null;
  activeVotes: Vote[];
  archivedIssues: Issue[];
  currentParticipant: Participant;
  isHost: boolean;
  issues: Issue[];
  pendingSync: PendingSync;
  participants: Participant[];
  roomName: string;
  onActivateIssue: (issue: Issue) => void;
  onAddIssue: (details: IssueDetailsInput) => Promise<boolean>;
  onArchiveEstimatedIssues: () => Promise<void>;
  onArchiveIssue: (issue: Issue) => Promise<void>;
  onDeleteIssue: (issue: Issue) => Promise<void>;
  onDeleteParticipant: (participant: Participant) => Promise<void>;
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
  pendingSync,
  participants,
  roomName,
  onActivateIssue,
  onAddIssue,
  onArchiveEstimatedIssues,
  onArchiveIssue,
  onDeleteIssue,
  onDeleteParticipant,
  onEditIssue,
  onImportIssues,
  onUnarchiveIssue,
}: RoomSidebarProps) {
  const { t } = useI18n();
  const [isAddIssueOpen, setIsAddIssueOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isImportIssuesOpen, setIsImportIssuesOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const estimatedIssuesCount = issues.filter((issue) => issue.estimate).length;

  const closeModal = () => {
    setIsAddIssueOpen(false);
    setEditingIssue(null);
  };

  const handleModalSubmit = (details: IssueDetailsInput) => {
    if (editingIssue) {
      return onEditIssue(editingIssue, details);
    }

    return onAddIssue(details);
  };

  const handleDeleteIssue = (issue: Issue) => {
    if (!window.confirm(t("confirm.deleteStory"))) {
      return;
    }

    void onDeleteIssue(issue);
  };

  const handleDeleteParticipant = (participant: Participant) => {
    if (!window.confirm(t("confirm.deleteParticipant", { name: participant.name }))) {
      return;
    }

    void onDeleteParticipant(participant);
  };

  const handleArchiveIssue = (issue: Issue) => {
    void onArchiveIssue(issue);
  };

  const handleArchiveEstimatedIssues = () => {
    if (!window.confirm(t("confirm.archiveEstimatedStories"))) {
      return;
    }

    void onArchiveEstimatedIssues();
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
                    <Text fw={700} truncate>
                      {participant.name}
                    </Text>
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
            <Settings size={18} aria-hidden="true" />
              <Title order={2} fz="lg">
                {t("label.stories")}
              </Title>
            </Group>
          {isHost ? (
              <Group gap={8}>
                <Tooltip label={t("action.import")}>
                  <ActionIcon variant="default" type="button" onClick={() => setIsImportIssuesOpen(true)} aria-label={t("action.import")}>
                    <Upload size={17} aria-hidden="true" />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("action.export")}>
                  <ActionIcon
                    variant="default"
                    type="button"
                    onClick={() => downloadJiraCsv(issues, roomName)}
                    disabled={issues.length === 0}
                    aria-label={t("action.export")}
                  >
                    <Download size={17} aria-hidden="true" />
                  </ActionIcon>
                </Tooltip>
              </Group>
          ) : null}
          </Group>
          <ScrollArea.Autosize mah={520} type="auto">
            <Stack gap="xs" pr={4}>
              {issues.map((issue) => {
                const link = issue.link ?? "";

            return (
                  <Paper key={issue.id} withBorder={issue.id === activeIssue?.id} bg={issue.id === activeIssue?.id ? "white" : "gray.0"} p="xs" radius="md">
                    <Stack gap={6}>
                      <UnstyledButton type="button" onClick={() => onActivateIssue(issue)} disabled={!isHost} p={6}>
                        <Stack gap={4}>
                          <Text fw={500} lineClamp={2}>
                            {issue.title}
                          </Text>
                          {link ? (
                            <Text c="dimmed" fz="xs" lineClamp={2}>
                              {link}
                            </Text>
                          ) : null}
                        </Stack>
                      </UnstyledButton>
                {issue.estimate || link || isHost ? (
                        <Group justify="space-between" gap="xs" pl={6}>
                          <Group gap={6}>
                            {pendingSync.activeIssueId === issue.id ? <Loader size="xs" aria-hidden="true" /> : null}
                            {issue.estimate ? <Badge variant="default">{issue.estimate}</Badge> : null}
                          </Group>
                          <Group gap={5}>
                      {link ? (
                              <Tooltip label={t("action.openStoryLink")}>
                                <ActionIcon component="a" variant="default" href={getExternalHref(link)} target="_blank" rel="noreferrer" aria-label={t("action.openStoryLink")}>
                                  <ExternalLink size={16} aria-hidden="true" />
                                </ActionIcon>
                              </Tooltip>
                      ) : null}
                      {isHost ? (
                        <>
                                <Tooltip label={issue.estimate ? t("action.archiveStory") : t("hint.archiveNeedsEstimate")}>
                                  <ActionIcon
                                    variant="default"
                                    type="button"
                                    onClick={() => handleArchiveIssue(issue)}
                                    aria-label={t("action.archiveStory")}
                                    disabled={!issue.estimate || pendingSync.archiveIssueId === issue.id || pendingSync.editIssueId === issue.id || pendingSync.deleteIssueId === issue.id}
                                  >
                                    {pendingSync.archiveIssueId === issue.id ? (
                                      <Loader size="xs" aria-hidden="true" />
                                    ) : (
                                      <Archive size={16} aria-hidden="true" />
                                    )}
                                  </ActionIcon>
                                </Tooltip>
                                <ActionIcon
                                  variant="default"
                            type="button"
                            onClick={() => setEditingIssue(issue)}
                            aria-label={t("action.editStory")}
                            disabled={pendingSync.editIssueId === issue.id || pendingSync.deleteIssueId === issue.id}
                          >
                            {pendingSync.editIssueId === issue.id ? (
                                    <Loader size="xs" aria-hidden="true" />
                            ) : (
                              <Pencil size={16} aria-hidden="true" />
                            )}
                                </ActionIcon>
                                <ActionIcon
                                  variant="default"
                                  color="red"
                            type="button"
                            onClick={() => handleDeleteIssue(issue)}
                            aria-label={t("action.deleteStory")}
                            disabled={pendingSync.deleteIssueId === issue.id || pendingSync.editIssueId === issue.id}
                          >
                            {pendingSync.deleteIssueId === issue.id ? (
                                    <Loader size="xs" aria-hidden="true" />
                            ) : (
                              <Trash2 size={16} aria-hidden="true" />
                            )}
                                </ActionIcon>
                        </>
                      ) : null}
                          </Group>
                        </Group>
                ) : null}
                    </Stack>
                  </Paper>
            );
          })}
            </Stack>
          </ScrollArea.Autosize>
        {isHost ? (
            <Group grow>
              <Button
                variant="default"
                type="button"
                onClick={handleArchiveEstimatedIssues}
                disabled={estimatedIssuesCount === 0 || pendingSync.archiveEstimatedIssues}
                leftSection={pendingSync.archiveEstimatedIssues ? <Loader size="xs" /> : <Archive size={18} aria-hidden="true" />}
              >
                {t("action.archiveEstimatedStories")}
              </Button>
              <Button variant="light" type="button" onClick={() => setIsAddIssueOpen(true)} leftSection={pendingSync.addIssue ? <Loader size="xs" /> : <Plus size={18} aria-hidden="true" />}>
              {t("action.addStory")}
              </Button>
            </Group>
        ) : null}
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

      <AddIssueModal
        issue={editingIssue}
        isOpen={isAddIssueOpen || Boolean(editingIssue)}
        isSaving={pendingSync.addIssue || Boolean(editingIssue && pendingSync.editIssueId === editingIssue.id)}
        onClose={closeModal}
        onSubmit={handleModalSubmit}
      />
      <ImportIssuesModal
        isOpen={isImportIssuesOpen}
        isSaving={pendingSync.addIssue}
        onClose={() => setIsImportIssuesOpen(false)}
        onSubmit={onImportIssues}
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
