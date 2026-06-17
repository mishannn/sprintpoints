import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Alert, Button, FileButton, Group, Modal, Paper, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { FileUp } from "lucide-react";
import type { IssueImportInput } from "../../../features/manage-issues/model/issues";
import {
  getInitialJiraImportMapping,
  mapJiraCsvRows,
  parseCsv,
  type CsvData,
  type JiraImportMapping,
} from "../../../features/manage-issues/model/jiraCsv";
import { translateError, useI18n } from "../../../shared/i18n";
import { AppError } from "../../../shared/lib/AppError";

type ImportIssuesModalProps = {
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (issues: IssueImportInput[]) => Promise<boolean>;
};

type MappingField = keyof JiraImportMapping;

const emptyMapping: JiraImportMapping = {
  title: null,
  description: null,
  link: null,
  estimate: null,
};

function parseSelectValue(value: string | null) {
  return value === null || value === "" ? null : Number(value);
}

function formatOptionLabel(header: string, index: number, unnamedColumnLabel: string) {
  return `${index + 1}. ${header || unnamedColumnLabel}`;
}

export function ImportIssuesModal({ isOpen, isSaving, onClose, onSubmit }: ImportIssuesModalProps) {
  const { t } = useI18n();
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [mapping, setMapping] = useState<JiraImportMapping>(emptyMapping);
  const [linkPattern, setLinkPattern] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mappedIssues = useMemo(() => (csvData ? mapJiraCsvRows(csvData, mapping, linkPattern) : []), [csvData, mapping, linkPattern]);
  const previewRows = mappedIssues.slice(0, 3);
  const columnOptions =
    csvData?.headers.map((header, index) => ({
      value: String(index),
      label: formatOptionLabel(header, index, t("import.unnamedColumn")),
    })) ?? [];

  function reset() {
    setCsvData(null);
    setMapping(emptyMapping);
    setLinkPattern("");
    setFileName("");
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleFileChange(file: File | null) {
    if (!file) {
      return;
    }

    try {
      const data = parseCsv(await file.text());

      if (data.headers.length === 0) {
        throw new AppError("csvHeaderEmpty");
      }

      setCsvData(data);
      setMapping(getInitialJiraImportMapping(data.headers));
      setFileName(file.name);
      setError(null);
    } catch (parseError) {
      setCsvData(null);
      setMapping(emptyMapping);
      setLinkPattern("");
      setFileName("");
      setError(translateError(parseError, t, t("error.readCsv")));
    }
  }

  function updateMapping(field: MappingField, value: string | null) {
    setMapping((current) => ({ ...current, [field]: parseSelectValue(value) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mapping.title === null) {
      setError(t("error.chooseTitleColumn"));
      return;
    }

    if (mappedIssues.length === 0) {
      setError(t("error.noMappedStories"));
      return;
    }

    const imported = await onSubmit(mappedIssues);
    if (imported) {
      close();
    }
  }

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      size="lg"
      title={
        <Stack gap={2}>
          <Text c="dimmed" fz="xs" fw={900} tt="uppercase">
            {t("common.csv")}
          </Text>
          <Text fw={700} fz="xl">
            {t("modal.importStoriesTitle")}
          </Text>
        </Stack>
      }
      aria-label={t("modal.importStoriesTitle")}
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <FileButton onChange={handleFileChange} accept=".csv,text/csv">
            {(props) => (
              <Button {...props} variant="light" leftSection={<FileUp size={18} aria-hidden="true" />}>
                {t("action.chooseCsvFile")}
              </Button>
            )}
          </FileButton>

          {fileName ? (
            <Text c="dimmed" fw={700}>
              {fileName}
            </Text>
          ) : null}
          {error ? <Alert color="red">{error}</Alert> : null}

          {csvData ? (
            <>
              <Stack gap="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select
                    label={t("common.title")}
                    placeholder={t("action.chooseColumn")}
                    data={columnOptions}
                    value={mapping.title === null ? null : String(mapping.title)}
                    onChange={(value) => updateMapping("title", value)}
                    required
                  />
                  <Select
                    label={t("common.description")}
                    placeholder={t("action.skip")}
                    data={columnOptions}
                    value={mapping.description === null ? null : String(mapping.description)}
                    onChange={(value) => updateMapping("description", value)}
                    clearable
                  />
                  <Select
                    label={t("common.link")}
                    placeholder={t("action.skip")}
                    data={columnOptions}
                    value={mapping.link === null ? null : String(mapping.link)}
                    onChange={(value) => updateMapping("link", value)}
                    clearable
                  />
                  <Select
                    label={t("common.estimate")}
                    placeholder={t("action.skip")}
                    data={columnOptions}
                    value={mapping.estimate === null ? null : String(mapping.estimate)}
                    onChange={(value) => updateMapping("estimate", value)}
                    clearable
                  />
                </SimpleGrid>
                <TextInput
                  label={t("field.linkPattern")}
                  value={linkPattern}
                  onChange={(event) => setLinkPattern(event.target.value)}
                  placeholder={t("placeholder.linkPattern")}
                  description={t("hint.linkPattern")}
                  inputMode="url"
                  disabled={mapping.link === null}
                />
              </Stack>

              <Paper withBorder bg="gray.0" p="md">
                <Stack gap="xs">
                  <Group justify="space-between" gap="sm">
                    <Text fw={700}>{t("common.storiesCount", { count: mappedIssues.length })}</Text>
                    <Text c="dimmed" fz="xs" fw={700}>
                      {t("common.csvRows", { count: csvData.rows.length })}
                    </Text>
                  </Group>
                {previewRows.map((issue, index) => (
                    <Paper key={`${issue.title}-${index}`} p="sm">
                      <Group justify="space-between" gap="sm" wrap="nowrap">
                        <Text fw={700} truncate>
                          {issue.title}
                        </Text>
                        <Text c="dimmed" fz="xs" fw={700} truncate>
                          {issue.estimate || issue.link || issue.description || t("common.noOptionalFields")}
                        </Text>
                      </Group>
                    </Paper>
                ))}
                </Stack>
              </Paper>
            </>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" type="button" onClick={close}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" disabled={!csvData} loading={isSaving} leftSection={<FileUp size={18} aria-hidden="true" />}>
              {t("action.import")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
