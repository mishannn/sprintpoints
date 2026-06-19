import { ActionIcon, Alert, Box, Button, Container, Grid, Group, Loader, Stack, Text, Title, Tooltip } from "@mantine/core";
import { Check, Clipboard, Eye, EyeOff, RefreshCcw } from "lucide-react";
import type { Issue, Notice, Participant, RoomState, Vote } from "../../../entities/room/model/types";
import type { IssueDetailsInput, IssueImportInput } from "../../../features/manage-issues/model/issues";
import type { PendingSync } from "../../../features/room-session/model/useRoomSession";
import { useCopyInviteLink } from "../../../features/copy-invite/model/useCopyInviteLink";
import { LanguageSelector } from "../../../shared/i18n/LanguageSelector";
import { useI18n } from "../../../shared/i18n";
import { InviteCard } from "../../../widgets/invite-card/ui/InviteCard";
import { RoomSidebar } from "../../../widgets/room-sidebar/ui/RoomSidebar";
import { VotingTable } from "../../../widgets/voting-table/ui/VotingTable";

type VoteSummary = {
  average: number;
  min: number;
  max: number;
} | null;

type RoomPageProps = {
  activeIssue: Issue | null;
  activeIssues: Issue[];
  activeVotes: Vote[];
  archivedIssues: Issue[];
  currentParticipant: Participant;
  currentVote: Vote | null;
  isHost: boolean;
  notice: Notice | null;
  pendingSync: PendingSync;
  state: RoomState;
  summary: VoteSummary;
  votersCount: number;
  voteGroups: Record<string, number>;
  onActivateIssue: (issue: Issue) => void;
  onAddIssue: (details: IssueDetailsInput) => Promise<boolean>;
  onArchiveEstimatedIssues: () => Promise<void>;
  onArchiveIssue: (issue: Issue) => Promise<void>;
  onDeleteIssue: (issue: Issue) => Promise<void>;
  onDeleteParticipant: (participant: Participant) => Promise<void>;
  onEditIssue: (issue: Issue, details: IssueDetailsInput) => Promise<boolean>;
  onImportIssues: (details: IssueImportInput[]) => Promise<boolean>;
  onUnarchiveIssue: (issue: Issue) => Promise<void>;
  onCastVote: (value: string) => void;
  onRefreshRoom: () => void;
  onResetVoting: () => void;
  onRevealVotes: () => void;
  onSwitchObserverMode: () => Promise<void>;
  onSetEstimate: (value: string) => void;
};

export function RoomPage({
  activeIssue,
  activeIssues,
  activeVotes,
  archivedIssues,
  currentParticipant,
  currentVote,
  isHost,
  notice,
  pendingSync,
  state,
  summary,
  votersCount,
  voteGroups,
  onActivateIssue,
  onAddIssue,
  onArchiveEstimatedIssues,
  onArchiveIssue,
  onDeleteIssue,
  onDeleteParticipant,
  onEditIssue,
  onImportIssues,
  onUnarchiveIssue,
  onCastVote,
  onRefreshRoom,
  onResetVoting,
  onRevealVotes,
  onSwitchObserverMode,
  onSetEstimate,
}: RoomPageProps) {
  const { t } = useI18n();
  const { copied, copyInviteLink } = useCopyInviteLink();
  const noticeColor = notice?.kind === "error" ? "red" : notice?.kind === "success" ? "gray" : "gray";

  const handleCopyInviteLink = () => {
    void copyInviteLink(state.room.code);
  };

  return (
    <Box component="main" bg="gray.0" mih="100vh" p={{ base: "md", md: "xl" }}>
      <Container size={1500} px={0}>
        <Group component="header" justify="space-between" align="flex-start" gap="md" mb="lg">
          <Stack gap={4}>
            <Text c="dimmed" fz="xs" fw={900} tt="uppercase">
              {t("common.room", { code: state.room.code })}
            </Text>
            <Title order={1} fz={{ base: 26, md: 31 }}>
              {state.room.name}
            </Title>
          </Stack>
          <Group gap="xs">
            <LanguageSelector />
            <Button
              variant="default"
              type="button"
              onClick={() => void onSwitchObserverMode()}
              disabled={pendingSync.observerMode}
              leftSection={
                pendingSync.observerMode ? (
                  <Loader size="xs" />
                ) : currentParticipant.is_spectator ? (
                  <EyeOff size={17} aria-hidden="true" />
                ) : (
                  <Eye size={17} aria-hidden="true" />
                )
              }
            >
              {currentParticipant.is_spectator ? t("action.becomeVoter") : t("action.becomeObserver")}
            </Button>
            <Tooltip label={t("action.copyInviteLink")}>
              <ActionIcon variant="default" size={36} type="button" onClick={handleCopyInviteLink} aria-label={t("action.copyInviteLink")}>
                {copied ? <Check size={19} aria-hidden="true" /> : <Clipboard size={19} aria-hidden="true" />}
              </ActionIcon>
            </Tooltip>
            <Button
              variant="default"
              type="button"
              onClick={onRefreshRoom}
              leftSection={pendingSync.refreshRoom ? <Loader size="xs" /> : <RefreshCcw size={17} aria-hidden="true" />}
            >
              {t("action.sync")}
            </Button>
          </Group>
        </Group>

        {notice ? (
          <Alert color={noticeColor} mb="lg">
            {notice.message}
          </Alert>
        ) : null}

        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 4, xl: 3 }}>
            <RoomSidebar
              activeIssue={activeIssue}
              activeVotes={activeVotes}
              archivedIssues={archivedIssues}
              currentParticipant={currentParticipant}
              isHost={isHost}
              issues={activeIssues}
              pendingSync={pendingSync}
              participants={state.participants}
              roomName={state.room.name}
              onActivateIssue={onActivateIssue}
              onAddIssue={onAddIssue}
              onArchiveEstimatedIssues={onArchiveEstimatedIssues}
              onArchiveIssue={onArchiveIssue}
              onDeleteIssue={onDeleteIssue}
              onDeleteParticipant={onDeleteParticipant}
              onEditIssue={onEditIssue}
              onImportIssues={onImportIssues}
              onUnarchiveIssue={onUnarchiveIssue}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 8, xl: 6 }}>
            <VotingTable
              activeIssue={activeIssue}
              activeVotes={activeVotes}
              currentParticipant={currentParticipant}
              currentVote={currentVote}
              isHost={isHost}
              issues={state.issues}
              pendingSync={pendingSync}
              participants={state.participants}
              room={state.room}
              summary={summary}
              votersCount={votersCount}
              voteGroups={voteGroups}
              onCastVote={onCastVote}
              onRevealVotes={onRevealVotes}
              onResetVoting={onResetVoting}
              onSetEstimate={onSetEstimate}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, xl: 3 }}>
            <InviteCard code={state.room.code} copied={copied} onCopyInviteLink={handleCopyInviteLink} />
          </Grid.Col>
        </Grid>
      </Container>
    </Box>
  );
}
