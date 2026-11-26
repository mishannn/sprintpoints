import { useEffect, useMemo, useState } from "react";
import { ActionIcon, Alert, Badge, Box, Button, Checkbox, Group, Loader, Menu, Modal, Paper, ScrollArea, SegmentedControl, Stack, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { Archive, ChevronDown, CopyX, Download, ExternalLink, ListChecks, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import type { Issue } from "../../../entities/room/model/types";
import type { IssueDetailsInput, IssueImportInput } from "../../../features/manage-issues/model/issues";
import { findDuplicateGroups, type DedupeMode } from "../../../features/manage-issues/model/dedupe";
import { matchesIssueQuery } from "../../../features/manage-issues/model/issueFilter";
import { downloadJiraCsv } from "../../../features/manage-issues/model/jiraCsv";
import type { PendingSync } from "../../../features/room-session/model/useRoomSession";
import { useI18n } from "../../../shared/i18n";
import { AddIssueModal } from "./AddIssueModal";
import { ImportIssuesModal } from "./ImportIssuesModal";

type IssuesOverlayProps = {
  activeIssueId: string | null;
  isHost: boolean;
  isOpen: boolean;
  issues: Issue[];
  pendingSync: PendingSync;
  roomName: string;
  onAddIssue: (details: IssueDetailsInput) => Promise<boolean>;
  onArchiveIssues: (issues: Issue[]) => Promise<boolean>;
  onClose: () => void;
  onDeleteIssues: (issues: Issue[]) => Promise<boolean>;
  onEditIssue: (issue: Issue, details: IssueDetailsInput) => Promise<boolean>;
  onImportIssues: (details: IssueImportInput[]) => Promise<boolean>;
};

type Feedback = {
  color: "gray" | "red";
  message: string;
};

type RunningAction = "delete" | "dedupe" | "archive" | "archive-one" | null;

function getExternalHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function IssuesOverlay({
  activeIssueId,
  isHost,
  isOpen,
  issues,
  pendingSync,
  roomName,
  onAddIssue,
  onArchiveIssues,
  onClose,
  onDeleteIssues,
  onEditIssue,
  onImportIssues,
}: IssuesOverlayProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [dedupeMode, setDedupeMode] = useState<DedupeMode>("link");
  const [runningAction, setRunningAction] = useState<RunningAction>(null);
  const [runningIssueId, setRunningIssueId] = useState<string | null>(null);
  const [isAddIssueOpen, setIsAddIssueOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [isImportIssuesOpen, setIsImportIssuesOpen] = useState(false);
  const isBusy =
    pendingSync.deleteIssues || pendingSync.archiveIssues || runningAction !== null;

  const visibleIssues = useMemo(
    () => issues.filter((issue) => matchesIssueQuery(issue, query)),
    [issues, query],
  );
  const duplicateGroups = useMemo(
    () => findDuplicateGroups(visibleIssues, activeIssueId, dedupeMode),
    [activeIssueId, dedupeMode, visibleIssues],
  );
  const duplicateIssues = useMemo(
    () => duplicateGroups.flatMap((group) => group.duplicates),
    [duplicateGroups],
  );
  const duplicateIds = useMemo(() => new Set(duplicateIssues.map((issue) => issue.id)), [duplicateIssues]);
  const selectedIssues = useMemo(
    () => issues.filter((issue) => selectedIds.has(issue.id)),
    [issues, selectedIds],
  );
  const allVisibleSelected = visibleIssues.length > 0 && visibleIssues.every((issue) => selectedIds.has(issue.id));
  const someVisibleSelected = !allVisibleSelected && visibleIssues.some((issue) => selectedIds.has(issue.id));
  const canArchiveSelection = selectedIssues.length > 0 && selectedIssues.every((issue) => issue.estimate);
  const estimatedVisibleCount = visibleIssues.filter((issue) => issue.estimate).length;
  const unestimatedVisibleCount = visibleIssues.length - estimatedVisibleCount;

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setQuery("");
    setSelectedIds(new Set());
    setFeedback(null);
    setDedupeMode("link");
    setRunningAction(null);
    setRunningIssueId(null);
    setIsAddIssueOpen(false);
    setEditingIssue(null);
    setIsImportIssuesOpen(false);
  }, [isOpen]);

  // Drop selections of stories that were deleted or archived elsewhere.
  useEffect(() => {
    setSelectedIds((current) => {
      const availableIds = new Set(issues.map((issue) => issue.id));
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [issues]);

  const toggleIssue = (issueId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(issueId);
      } else {
        next.delete(issueId);
      }

      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      for (const issue of visibleIssues) {
        if (checked) {
          next.add(issue.id);
        } else {
          next.delete(issue.id);
        }
      }

      return next;
    });
  };

  const selectOnly = (mode: "estimated" | "unestimated") => {
    setSelectedIds(
      new Set(
        visibleIssues
          .filter((issue) => (mode === "estimated" ? Boolean(issue.estimate) : !issue.estimate))
          .map((issue) => issue.id),
      ),
    );
    setFeedback(null);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setFeedback(null);
  };

  const removeFromSelection = (targets: Issue[]) => {
    const targetIds = new Set(targets.map((issue) => issue.id));
    setSelectedIds((current) => new Set([...current].filter((id) => !targetIds.has(id))));
  };

  const deleteIssues = async (targets: Issue[], successMessage: string) => {
    const deleted = await onDeleteIssues(targets);

    if (!deleted) {
      setFeedback({ color: "red", message: t("error.deleteStories") });
      return;
    }

    removeFromSelection(targets);
    setFeedback({ color: "gray", message: successMessage });
  };

  const archiveIssues = async (targets: Issue[], successMessage: string) => {
    const archived = await onArchiveIssues(targets);

    if (!archived) {
      setFeedback({ color: "red", message: t("error.archiveStories") });
      return;
    }

    removeFromSelection(targets);
    setFeedback({ color: "gray", message: successMessage });
  };

  const handleDeleteSelected = async () => {
    if (selectedIssues.length === 0) {
      return;
    }

    const count = selectedIssues.length;
    if (!window.confirm(t("confirm.deleteSelectedStories", { count }))) {
      return;
    }

    setFeedback(null);
    setRunningAction("delete");
    try {
      await deleteIssues(selectedIssues, t("notice.deletedStories", { count }));
    } finally {
      setRunningAction(null);
    }
  };

  const handleArchiveSelected = async () => {
    if (!canArchiveSelection) {
      return;
    }

    const count = selectedIssues.length;
    if (!window.confirm(t("confirm.archiveSelectedStories", { count }))) {
      return;
    }

    setFeedback(null);
    setRunningAction("archive");
    try {
      await archiveIssues(selectedIssues, t("notice.archivedStories", { count }));
    } finally {
      setRunningAction(null);
    }
  };

  const handleArchiveIssue = async (issue: Issue) => {
    setFeedback(null);
    setRunningAction("archive-one");
    setRunningIssueId(issue.id);
    try {
      await archiveIssues([issue], t("notice.archivedStories", { count: 1 }));
    } finally {
      setRunningAction(null);
      setRunningIssueId(null);
    }
  };

  const handleDedupe = async () => {
    if (duplicateIssues.length === 0) {
      setFeedback({ color: "gray", message: t("state.noDuplicates") });
      return;
    }

    const count = duplicateIssues.length;
    if (!window.confirm(t("confirm.dedupeStories", { count }))) {
      return;
    }

    setFeedback(null);
    setRunningAction("dedupe");
    try {
      await deleteIssues(duplicateIssues, t("notice.deduplicatedStories", { count }));
    } finally {
      setRunningAction(null);
    }
  };

  const handleModalSubmit = (details: IssueDetailsInput) => {
    if (editingIssue) {
      return onEditIssue(editingIssue, details);
    }

    return onAddIssue(details);
  };

  const closeIssueModal = () => {
    setIsAddIssueOpen(false);
    setEditingIssue(null);
  };

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={onClose}
        fullScreen
        title={
          <Group gap="sm">
            <Title order={2} fz="xl">
              {t("label.stories")}
            </Title>
            <Badge variant="default">{issues.length}</Badge>
          </Group>
        }
        aria-label={t("label.stories")}
        styles={{
          content: { display: "flex", flexDirection: "column", overflow: "hidden" },
          body: { display: "flex", flex: 1, flexDirection: "column", minHeight: 0 },
        }}
      >
        <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
          <Group gap="sm" wrap="wrap" align="flex-end">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t("placeholder.searchStories")}
              aria-label={t("aria.searchStories")}
              leftSection={<Search size={16} aria-hidden="true" />}
              rightSection={
                query ? (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("action.clearSearch")}
                  >
                    <X size={14} aria-hidden="true" />
                  </ActionIcon>
                ) : null
              }
              style={{ flex: "1 1 260px" }}
              autoFocus
            />
            {isHost ? (
              <Group gap="xs" wrap="nowrap">
                <Button
                  variant="light"
                  type="button"
                  onClick={() => setIsAddIssueOpen(true)}
                  leftSection={<Plus size={17} aria-hidden="true" />}
                >
                  {t("action.addStory")}
                </Button>
                <Tooltip label={t("action.import")}>
                  <ActionIcon
                    variant="default"
                    type="button"
                    onClick={() => setIsImportIssuesOpen(true)}
                    aria-label={t("action.import")}
                  >
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

          {isHost ? (
            <Group gap="sm" wrap="wrap" align="center">
              <Group gap={6} wrap="nowrap">
                <Text c="dimmed" fz="sm" fw={600}>
                  {t("label.dedupeBy")}
                </Text>
                <SegmentedControl
                  size="xs"
                  value={dedupeMode}
                  onChange={(value) => setDedupeMode(value as DedupeMode)}
                  data={[
                    { label: t("common.link"), value: "link" },
                    { label: t("common.title"), value: "title" },
                  ]}
                  disabled={isBusy}
                />
              </Group>
              <Tooltip label={dedupeMode === "link" ? t("hint.dedupeLink") : t("hint.dedupeTitle")}>
                <Button
                  variant="default"
                  type="button"
                  onClick={() => void handleDedupe()}
                  disabled={isBusy || visibleIssues.length < 2}
                  leftSection={runningAction === "dedupe" ? undefined : <CopyX size={17} aria-hidden="true" />}
                  loading={runningAction === "dedupe"}
                  rightSection={duplicateIssues.length > 0 ? <Badge variant="default">{duplicateIssues.length}</Badge> : undefined}
                >
                  {t("action.removeDuplicates")}
                </Button>
              </Tooltip>
            </Group>
          ) : null}

          {feedback ? <Alert color={feedback.color}>{feedback.message}</Alert> : null}

          <Group justify="space-between" align="center" gap="sm" wrap="wrap">
            {isHost ? (
              <Group gap="md" wrap="wrap">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected}
                  onChange={(event) => toggleAllVisible(event.currentTarget.checked)}
                  label={t("action.selectAll")}
                  disabled={isBusy || visibleIssues.length === 0}
                />
                <Menu position="bottom-start" withinPortal>
                  <Menu.Target>
                    <Button
                      variant="default"
                      type="button"
                      leftSection={<ListChecks size={16} aria-hidden="true" />}
                      rightSection={<ChevronDown size={14} aria-hidden="true" />}
                      disabled={isBusy || visibleIssues.length === 0}
                    >
                      {t("action.selectOnly")}
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => selectOnly("estimated")} disabled={estimatedVisibleCount === 0}>
                      {t("action.selectEstimated")}
                    </Menu.Item>
                    <Menu.Item onClick={() => selectOnly("unestimated")} disabled={unestimatedVisibleCount === 0}>
                      {t("action.selectUnestimated")}
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item onClick={clearSelection} disabled={selectedIssues.length === 0}>
                      {t("action.clearSelection")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                {selectedIssues.length > 0 ? (
                  <Text c="dimmed" fz="sm" fw={600}>
                    {t("overlay.selected", { count: selectedIssues.length })}
                  </Text>
                ) : null}
              </Group>
            ) : (
              <Box />
            )}
            <Group gap="xs" wrap="wrap" justify="flex-end">
              <Text c="dimmed" fz="sm" fw={600}>
                {t("overlay.results", { shown: visibleIssues.length, total: issues.length })}
              </Text>
              {isHost ? (
                <>
                  <Button
                    variant="default"
                    type="button"
                    onClick={() => void handleArchiveSelected()}
                    disabled={isBusy || !canArchiveSelection}
                    loading={runningAction === "archive"}
                    leftSection={<Archive size={17} aria-hidden="true" />}
                  >
                    {selectedIssues.length > 0
                      ? t("action.archiveSelectedCount", { count: selectedIssues.length })
                      : t("action.archiveSelected")}
                  </Button>
                  <Button
                    color="red"
                    variant="light"
                    type="button"
                    onClick={() => void handleDeleteSelected()}
                    disabled={isBusy || selectedIssues.length === 0}
                    leftSection={<Trash2 size={17} aria-hidden="true" />}
                    loading={runningAction === "delete"}
                  >
                    {selectedIssues.length > 0
                      ? t("action.deleteSelectedCount", { count: selectedIssues.length })
                      : t("action.deleteSelected")}
                  </Button>
                </>
              ) : null}
            </Group>
          </Group>

          {isHost && selectedIssues.length > 0 && !canArchiveSelection ? (
            <Text c="dimmed" fz="xs">
              {t("hint.archiveSelectedNeedsEstimate")}
            </Text>
          ) : null}

          <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
            {visibleIssues.length === 0 ? (
              <Paper withBorder bg="gray.0" p="xl">
                <Text c="dimmed" fw={700} ta="center">
                  {issues.length === 0 ? t("state.noStories") : t("state.noSearchResults")}
                </Text>
              </Paper>
            ) : (
              <Stack gap="xs" pr={4}>
                {visibleIssues.map((issue) => {
                  const link = issue.link ?? "";
                  const selected = selectedIds.has(issue.id);

                  return (
                    <Paper
                      key={issue.id}
                      withBorder
                      bg={selected ? "gray.1" : "gray.0"}
                      p="sm"
                      radius="md"
                    >
                      <Group align="flex-start" gap="sm" wrap="nowrap">
                        {isHost ? (
                          <Checkbox
                            mt={3}
                            checked={selected}
                            onChange={(event) => toggleIssue(issue.id, event.currentTarget.checked)}
                            aria-label={t("aria.selectStory", { title: issue.title })}
                            disabled={isBusy}
                          />
                        ) : null}
                        <Box miw={0} style={{ flex: 1 }}>
                          <Group gap="xs" wrap="wrap">
                            <Text fw={600} lineClamp={2} style={{ overflowWrap: "anywhere" }}>
                              {issue.title}
                            </Text>
                            {issue.id === activeIssueId ? (
                              <Badge variant="light">{t("label.activeStory")}</Badge>
                            ) : null}
                            {issue.estimate ? <Badge variant="default">{issue.estimate}</Badge> : null}
                            {duplicateIds.has(issue.id) ? (
                              <Tooltip label={t("hint.duplicate")}>
                                <Badge color="orange" variant="light">
                                  {t("label.duplicate")}
                                </Badge>
                              </Tooltip>
                            ) : null}
                          </Group>
                          {link ? (
                            <Text c="dimmed" fz="xs" lineClamp={1}>
                              {link}
                            </Text>
                          ) : null}
                          {issue.description ? (
                            <Text c="dimmed" fz="sm" lineClamp={2}>
                              {issue.description}
                            </Text>
                          ) : null}
                        </Box>
                        <Group gap={5} wrap="nowrap">
                          {isHost ? (
                            <>
                              <Tooltip label={t("action.editStory")}>
                                <ActionIcon
                                  variant="default"
                                  type="button"
                                  onClick={() => setEditingIssue(issue)}
                                  aria-label={t("action.editStory")}
                                  disabled={isBusy || pendingSync.editIssueId === issue.id}
                                >
                                  {pendingSync.editIssueId === issue.id ? (
                                    <Loader size="xs" aria-hidden="true" />
                                  ) : (
                                    <Pencil size={16} aria-hidden="true" />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label={issue.estimate ? t("action.archiveStory") : t("hint.archiveNeedsEstimate")}>
                                <ActionIcon
                                  variant="default"
                                  type="button"
                                  onClick={() => void handleArchiveIssue(issue)}
                                  aria-label={t("action.archiveStory")}
                                  disabled={!issue.estimate || isBusy}
                                >
                                  {runningAction === "archive-one" && runningIssueId === issue.id ? (
                                    <Loader size="xs" aria-hidden="true" />
                                  ) : (
                                    <Archive size={16} aria-hidden="true" />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                            </>
                          ) : null}
                          {link ? (
                            <Tooltip label={t("action.openStoryLink")}>
                              <ActionIcon
                                component="a"
                                variant="default"
                                href={getExternalHref(link)}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t("action.openStoryLink")}
                              >
                                <ExternalLink size={16} aria-hidden="true" />
                              </ActionIcon>
                            </Tooltip>
                          ) : null}
                        </Group>
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </ScrollArea>
        </Stack>
      </Modal>

      <AddIssueModal
        issue={editingIssue}
        isOpen={isAddIssueOpen || Boolean(editingIssue)}
        isSaving={pendingSync.addIssue || Boolean(editingIssue && pendingSync.editIssueId === editingIssue.id)}
        onClose={closeIssueModal}
        onSubmit={handleModalSubmit}
      />
      <ImportIssuesModal
        isOpen={isImportIssuesOpen}
        isSaving={pendingSync.addIssue}
        onClose={() => setIsImportIssuesOpen(false)}
        onSubmit={onImportIssues}
      />
    </>
  );
}
