import { useEffect, useMemo, useState } from "react";
import { ActionIcon, Alert, Badge, Box, Button, Checkbox, Group, Modal, Paper, ScrollArea, Stack, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { CopyX, ExternalLink, Search, Trash2, X } from "lucide-react";
import type { Issue } from "../../../entities/room/model/types";
import { findDuplicateGroups } from "../../../features/manage-issues/model/dedupe";
import { useI18n } from "../../../shared/i18n";

type IssuesOverlayProps = {
  activeIssueId: string | null;
  isDeleting: boolean;
  isHost: boolean;
  isOpen: boolean;
  issues: Issue[];
  onClose: () => void;
  onDeleteIssues: (issues: Issue[]) => Promise<boolean>;
};

type Feedback = {
  color: "gray" | "red";
  message: string;
};

function getExternalHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function IssuesOverlay({
  activeIssueId,
  isDeleting,
  isHost,
  isOpen,
  issues,
  onClose,
  onDeleteIssues,
}: IssuesOverlayProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [runningAction, setRunningAction] = useState<"delete" | "dedupe" | null>(null);
  const isBusy = isDeleting || runningAction !== null;

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleIssues = useMemo(() => {
    if (!normalizedQuery) {
      return issues;
    }

    return issues.filter((issue) =>
      [issue.title, issue.description, issue.link].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }, [issues, normalizedQuery]);

  const duplicateGroups = useMemo(() => findDuplicateGroups(visibleIssues, activeIssueId), [activeIssueId, visibleIssues]);
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

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setQuery("");
    setSelectedIds(new Set());
    setFeedback(null);
    setRunningAction(null);
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

  const deleteIssues = async (targets: Issue[], successMessage: string) => {
    const deleted = await onDeleteIssues(targets);

    if (!deleted) {
      setFeedback({ color: "red", message: t("error.deleteStories") });
      return;
    }

    setSelectedIds(new Set());
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

  return (
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
              <Tooltip label={t("hint.dedupe")}>
                <Button
                  variant="default"
                  type="button"
                  onClick={() => void handleDedupe()}
                  disabled={isBusy || issues.length < 2}
                  leftSection={runningAction === "dedupe" ? undefined : <CopyX size={17} aria-hidden="true" />}
                  loading={runningAction === "dedupe"}
                  rightSection={duplicateIssues.length > 0 ? <Badge variant="default">{duplicateIssues.length}</Badge> : undefined}
                >
                  {t("action.removeDuplicates")}
                </Button>
              </Tooltip>
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
            </Group>
          ) : null}
        </Group>

        {feedback ? <Alert color={feedback.color}>{feedback.message}</Alert> : null}

        <Group justify="space-between" align="center" gap="sm">
          {isHost ? (
            <Checkbox
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              onChange={(event) => toggleAllVisible(event.currentTarget.checked)}
              label={t("action.selectAll")}
              disabled={isBusy || visibleIssues.length === 0}
            />
          ) : (
            <Box />
          )}
          <Text c="dimmed" fz="sm" fw={600}>
            {t("overlay.results", { shown: visibleIssues.length, total: issues.length })}
          </Text>
        </Group>

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
                  </Paper>
                );
              })}
            </Stack>
          )}
        </ScrollArea>
      </Stack>
    </Modal>
  );
}
