import { Box, Code, Group, Paper, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { Sparkles } from "lucide-react";
import { LanguageSelector } from "../../../shared/i18n/LanguageSelector";
import { useI18n } from "../../../shared/i18n";

export function SetupRequiredPage() {
  const { t } = useI18n();

  return (
    <Box component="main" bg="gray.0" mih="100vh" p={{ base: "md", md: 36 }}>
      <Group justify="center" align="center" mih="calc(100vh - 72px)">
        <Paper component="section" withBorder shadow="xl" p={{ base: "xl", md: 34 }} maw={620}>
          <Stack gap="lg">
            <Group justify="space-between">
              <ThemeIcon size={48} radius="md" color="gray">
            <Sparkles size={26} aria-hidden="true" />
              </ThemeIcon>
              <LanguageSelector />
            </Group>
            <Title order={1}>{t("setup.heading")}</Title>
            <Text c="dimmed" lh={1.7}>
              {t("setup.instructionsIntro")} <Code>supabase/migrations</Code>, {t("setup.instructionsAfterMigration")}{" "}
              <Code>.env.example</Code> {t("setup.instructionsTo")} <Code>.env</Code> {t("setup.instructionsOutro")}
            </Text>
          </Stack>
        </Paper>
      </Group>
    </Box>
  );
}
