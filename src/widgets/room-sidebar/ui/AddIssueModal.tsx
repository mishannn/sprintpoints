import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { Pencil, Plus } from "lucide-react";
import type { Issue } from "../../../entities/room/model/types";
import type { IssueDetailsInput } from "../../../features/manage-issues/model/issues";
import { useI18n } from "../../../shared/i18n";

type AddIssueModalProps = {
  issue: Issue | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (details: IssueDetailsInput) => Promise<boolean>;
};

const emptyIssue: IssueDetailsInput = {
  title: "",
  description: "",
  link: "",
};

function getInitialIssue(issue: Issue | null): IssueDetailsInput {
  return issue
    ? {
        title: issue.title,
        description: issue.description ?? "",
        link: issue.link ?? "",
      }
    : emptyIssue;
}

export function AddIssueModal({ issue: editingIssue, isOpen, isSaving, onClose, onSubmit }: AddIssueModalProps) {
  const { t } = useI18n();
  const [issue, setIssue] = useState<IssueDetailsInput>(emptyIssue);
  const isEditing = Boolean(editingIssue);
  const editingIssueId = editingIssue?.id ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setIssue(getInitialIssue(editingIssue));
  }, [editingIssueId, isOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const added = await onSubmit(issue);
    if (added) {
      setIssue(emptyIssue);
      onClose();
    }
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        <Stack gap={2}>
          <Text c="dimmed" fz="xs" fw={900} tt="uppercase">
            {t("common.story")}
          </Text>
          <Text fw={700} fz="xl">
            {isEditing ? t("modal.editStoryTitle") : t("modal.addStoryTitle")}
          </Text>
        </Stack>
      }
      aria-label={isEditing ? t("modal.editStoryTitle") : t("modal.addStoryTitle")}
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label={t("common.title")}
              value={issue.title}
              onChange={(event) => setIssue((current) => ({ ...current, title: event.target.value }))}
              placeholder={t("placeholder.title")}
              autoFocus
              required
            />
          <TextInput
            label={t("common.link")}
              value={issue.link}
              onChange={(event) => setIssue((current) => ({ ...current, link: event.target.value }))}
              placeholder={t("placeholder.link")}
              inputMode="url"
            />
          <Textarea
            label={t("common.description")}
              value={issue.description}
              onChange={(event) => setIssue((current) => ({ ...current, description: event.target.value }))}
              placeholder={t("placeholder.description")}
              rows={5}
            />

          <Group justify="flex-end">
            <Button variant="default" type="button" onClick={onClose}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" loading={isSaving} leftSection={isEditing ? <Pencil size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}>
              {isEditing ? t("action.saveStory") : t("action.addStory")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
