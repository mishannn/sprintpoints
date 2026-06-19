import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isAppError } from "../lib/AppError";

export type Language = "en" | "ru";

type TranslationParams = Record<string, number | string>;
type TranslationValue = string | ((params: TranslationParams) => string);

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: TranslationParams) => string;
};

const storageKey = "planning-poker-language";

export const languages: Array<{ code: Language; label: string }> = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
];

const translations: Record<Language, Record<string, TranslationValue>> = {
  en: {
    "action.addStory": "Add story",
    "action.archiveEstimatedStories": "Archive estimated",
    "action.archiveStory": "Archive story",
    "action.cancel": "Cancel",
    "action.chooseColumn": "Choose column",
    "action.chooseCsvFile": "Choose CSV file",
    "action.closeAddStoryForm": "Close add story form",
    "action.closeImportForm": "Close import form",
    "action.copyInviteLink": "Copy invite link",
    "action.copyLink": "Copy link",
    "action.copied": "Copied",
    "action.createRoom": "Create room",
    "action.deleteStory": "Delete story",
    "action.deleteParticipant": "Delete user",
    "action.editStory": "Edit story",
    "action.export": "Export",
    "action.import": "Import",
    "action.joinRoom": "Join room",
    "action.openArchive": "Archive",
    "action.openGitHubRepository": "Open GitHub repository",
    "action.openStoryLink": "Open story link",
    "action.reset": "Reset",
    "action.reveal": "Reveal",
    "action.saveStory": "Save story",
    "action.skip": "Skip",
    "action.sync": "Sync",
    "action.unarchiveStory": "Unarchive story",
    "aria.finalEstimate": "Final estimate",
    "aria.language": "Language",
    "aria.notVoted": "Not voted",
    "aria.voteCards": "Vote cards",
    "brand.name": "Sprint Points",
    "common.average": "Average",
    "common.archive": "Archive",
    "common.archived": "Archived",
    "common.csv": "CSV",
    "common.csvRows": "{count} CSV rows",
    "common.description": "Description",
    "common.estimate": "Estimate",
    "common.link": "Link",
    "common.noOptionalFields": "No optional fields",
    "common.noVote": "No vote",
    "common.range": "Range",
    "common.room": "Room {code}",
    "common.story": "Story",
    "common.storiesCount": ({ count }) => `${count} ${Number(count) === 1 ? "story" : "stories"}`,
    "common.title": "Title",
    "common.votes": "Votes",
    "confirm.deleteStory": "Delete this story?",
    "confirm.archiveEstimatedStories": "Archive all estimated stories?",
    "confirm.deleteParticipant": ({ name }) => `Delete ${name} from the room?`,
    "error.activateImportedStory": "Could not activate the imported story.",
    "error.activateNewStory": "Could not activate the new story.",
    "error.activateStory": "Could not switch story.",
    "error.activateStoryAfterArchive": "Could not activate the next story after archiving.",
    "error.addFacilitator": "Could not add the facilitator.",
    "error.addStory": "Could not add the story.",
    "error.archiveStory": "Could not archive the story.",
    "error.archiveEstimatedStories": "Could not archive estimated stories.",
    "error.chooseTitleColumn": "Choose a column for Title.",
    "error.createFirstStory": "Could not create the first story.",
    "error.createRoom": "Could not create the room.",
    "error.createRoomApi": "Could not create a room.",
    "error.csvHeaderEmpty": "CSV header row is empty.",
    "error.deleteStory": "Could not delete the story.",
    "error.deleteParticipant": "Could not delete the user.",
    "error.importStories": "Could not import stories.",
    "error.joinRoom": "Could not join the room.",
    "error.joinRoomRequired": "Enter a room code and your name.",
    "error.loadRoom": "Could not open room.",
    "error.loadRoomState": "Could not load the room state.",
    "error.noMappedStories": "No stories found with the selected mapping.",
    "error.readCsv": "Could not read the CSV file.",
    "error.refreshRoom": "Could not refresh the room.",
    "error.resetVoting": "Could not reset voting.",
    "error.revealVotes": "Could not reveal votes.",
    "error.roomNotFound": "Room not found.",
    "error.saveEstimate": "Could not save the estimate.",
    "error.saveVote": "Could not save your vote.",
    "error.storyTitleRequired": "Story title is required.",
    "error.supabaseMissing": "Supabase is not configured.",
    "error.unarchiveStory": "Could not unarchive the story.",
    "error.updateStory": "Could not update the story.",
    "feature.hiddenVotes": "Hidden votes",
    "feature.realtimeRooms": "Realtime rooms",
    "feature.storyQueue": "Story queue",
    "field.hostName": "Your name",
    "field.linkPattern": "URL pattern",
    "field.participantName": "Your name",
    "field.roomCode": "Room code",
    "field.roomName": "Room name",
    "field.spectator": "Join as spectator",
    "fallback.facilitator": "Facilitator",
    "fallback.firstStory": "First story",
    "fallback.roomName": "Sprint planning",
    "import.unnamedColumn": "Unnamed column",
    "hint.linkPattern": "Optional. Use {VALUE} where the selected Link value should appear.",
    "hint.archiveNeedsEstimate": "Only estimated stories can be archived.",
    "label.activeStory": "Active story",
    "label.inviteTeammates": "Invite teammates",
    "label.people": "People",
    "label.revealedVotes": "Votes by person",
    "label.sameEstimate": ({ value }) => `Stories estimated ${value}`,
    "label.stories": "Stories",
    "lobby.heading": "Estimate sprint work with a shared realtime deck.",
    "lobby.placeholderHostName": "Alex",
    "lobby.placeholderParticipantName": "Taylor",
    "lobby.placeholderRoomName": "Sprint planning",
    "lobby.supporting": "Create an invite-only room, vote privately, reveal together, and keep story estimates visible for the whole session.",
    "modal.addStoryTitle": "Add story",
    "modal.archiveTitle": "Archived stories",
    "modal.editStoryTitle": "Edit story",
    "modal.importStoriesTitle": "Import stories",
    "notice.importedStories": ({ count }) => `Imported ${count} ${Number(count) === 1 ? "story" : "stories"}.`,
    "notice.joinedRoom": "Joined the room.",
    "notice.roomCreated": "Room created.",
    "participant.spectator": "Spectator",
    "participant.voted": "Voted",
    "participant.waiting": "Waiting",
    "placeholder.description": "Perfect long description",
    "placeholder.link": "https://jira.example.org/browse/TASK-200",
    "placeholder.linkPattern": "https://jira.company.org/browse/{VALUE}",
    "placeholder.roomCode": "ABC123",
    "placeholder.title": "Good task",
    "setup.heading": "Connect Supabase to start planning",
    "setup.instructionsAfterMigration": "then copy",
    "setup.instructionsIntro": "Create a cloud Supabase project, run the SQL migration in",
    "setup.instructionsOutro": "and set your project URL and anon key.",
    "setup.instructionsTo": "to",
    "share.description": "Share the room code or copy the current link.",
    "state.noStorySelected": "No story selected",
    "state.archiveEmpty": "No archived stories.",
    "state.noMatchingEstimate": "No stories with this estimate yet.",
    "state.revealed": "Revealed",
    "state.voting": "Voting",
    "voting.hiddenResults": "Votes stay hidden until the facilitator reveals them.",
  },
  ru: {
    "action.addStory": "Добавить",
    "action.archiveEstimatedStories": "Архивировать оцененные",
    "action.archiveStory": "Архивировать задачу",
    "action.cancel": "Отмена",
    "action.chooseColumn": "Выберите колонку",
    "action.chooseCsvFile": "Выбрать CSV-файл",
    "action.closeAddStoryForm": "Закрыть форму задачи",
    "action.closeImportForm": "Закрыть форму импорта",
    "action.copyInviteLink": "Скопировать ссылку-приглашение",
    "action.copyLink": "Скопировать ссылку",
    "action.copied": "Скопировано",
    "action.createRoom": "Создать комнату",
    "action.deleteStory": "Удалить задачу",
    "action.deleteParticipant": "Удалить участника",
    "action.editStory": "Редактировать задачу",
    "action.export": "Экспорт",
    "action.import": "Импорт",
    "action.joinRoom": "Войти в комнату",
    "action.openArchive": "Архив",
    "action.openGitHubRepository": "Открыть репозиторий GitHub",
    "action.openStoryLink": "Открыть ссылку задачи",
    "action.reset": "Сбросить",
    "action.reveal": "Показать",
    "action.saveStory": "Сохранить задачу",
    "action.skip": "Пропустить",
    "action.sync": "Синхронизировать",
    "action.unarchiveStory": "Вернуть из архива",
    "aria.finalEstimate": "Итоговая оценка",
    "aria.language": "Язык",
    "aria.notVoted": "Не проголосовал",
    "aria.voteCards": "Карты для голосования",
    "brand.name": "Sprint Points",
    "common.average": "Среднее",
    "common.archive": "Архив",
    "common.archived": "В архиве",
    "common.csv": "CSV",
    "common.csvRows": ({ count }) => `${count} ${getRussianPlural(Number(count), "строка CSV", "строки CSV", "строк CSV")}`,
    "common.description": "Описание",
    "common.estimate": "Оценка",
    "common.link": "Ссылка",
    "common.noOptionalFields": "Нет дополнительных полей",
    "common.noVote": "Нет голоса",
    "common.range": "Диапазон",
    "common.room": "Комната {code}",
    "common.story": "Задача",
    "common.storiesCount": ({ count }) => `${count} ${getRussianPlural(Number(count), "задача", "задачи", "задач")}`,
    "common.title": "Название",
    "common.votes": "Голоса",
    "confirm.deleteStory": "Удалить эту задачу?",
    "confirm.archiveEstimatedStories": "Архивировать все оцененные задачи?",
    "confirm.deleteParticipant": ({ name }) => `Удалить ${name} из комнаты?`,
    "error.activateImportedStory": "Не удалось активировать импортированную задачу.",
    "error.activateNewStory": "Не удалось активировать новую задачу.",
    "error.activateStory": "Не удалось переключить задачу.",
    "error.activateStoryAfterArchive": "Не удалось активировать следующую задачу после архивации.",
    "error.addFacilitator": "Не удалось добавить фасилитатора.",
    "error.addStory": "Не удалось добавить задачу.",
    "error.archiveStory": "Не удалось архивировать задачу.",
    "error.archiveEstimatedStories": "Не удалось архивировать оцененные задачи.",
    "error.chooseTitleColumn": "Выберите колонку для названия.",
    "error.createFirstStory": "Не удалось создать первую задачу.",
    "error.createRoom": "Не удалось создать комнату.",
    "error.createRoomApi": "Не удалось создать комнату.",
    "error.csvHeaderEmpty": "Строка заголовков CSV пустая.",
    "error.deleteStory": "Не удалось удалить задачу.",
    "error.deleteParticipant": "Не удалось удалить участника.",
    "error.importStories": "Не удалось импортировать задачи.",
    "error.joinRoom": "Не удалось войти в комнату.",
    "error.joinRoomRequired": "Введите код комнаты и ваше имя.",
    "error.loadRoom": "Не удалось открыть комнату.",
    "error.loadRoomState": "Не удалось загрузить состояние комнаты.",
    "error.noMappedStories": "Не найдены задачи с выбранным соответствием колонок.",
    "error.readCsv": "Не удалось прочитать CSV-файл.",
    "error.refreshRoom": "Не удалось обновить комнату.",
    "error.resetVoting": "Не удалось сбросить голосование.",
    "error.revealVotes": "Не удалось показать голоса.",
    "error.roomNotFound": "Комната не найдена.",
    "error.saveEstimate": "Не удалось сохранить оценку.",
    "error.saveVote": "Не удалось сохранить ваш голос.",
    "error.storyTitleRequired": "Название задачи обязательно.",
    "error.supabaseMissing": "Supabase не настроен.",
    "error.unarchiveStory": "Не удалось вернуть задачу из архива.",
    "error.updateStory": "Не удалось обновить задачу.",
    "feature.hiddenVotes": "Скрытые голоса",
    "feature.realtimeRooms": "Комнаты в реальном времени",
    "feature.storyQueue": "Очередь задач",
    "field.hostName": "Ваше имя",
    "field.linkPattern": "URL-шаблон",
    "field.participantName": "Ваше имя",
    "field.roomCode": "Код комнаты",
    "field.roomName": "Название комнаты",
    "field.spectator": "Войти наблюдателем",
    "fallback.facilitator": "Фасилитатор",
    "fallback.firstStory": "Первая задача",
    "fallback.roomName": "Планирование спринта",
    "hint.linkPattern": "Необязательно. Используйте {VALUE} там, где должно быть значение из выбранной колонки ссылки.",
    "hint.archiveNeedsEstimate": "Архивировать можно только оцененные задачи.",
    "import.unnamedColumn": "Колонка без названия",
    "label.activeStory": "Активная задача",
    "label.inviteTeammates": "Пригласить команду",
    "label.people": "Участники",
    "label.revealedVotes": "Голоса участников",
    "label.sameEstimate": ({ value }) => `Задачи с оценкой ${value}`,
    "label.stories": "Задачи",
    "lobby.heading": "Оценивайте задачи спринта общей колодой в реальном времени.",
    "lobby.placeholderHostName": "Алексей",
    "lobby.placeholderParticipantName": "Мария",
    "lobby.placeholderRoomName": "Планирование спринта",
    "lobby.supporting": "Создайте комнату по приглашению, голосуйте приватно, открывайте оценки вместе и сохраняйте результаты для всей сессии.",
    "modal.addStoryTitle": "Добавить задачу",
    "modal.archiveTitle": "Архив задач",
    "modal.editStoryTitle": "Редактировать задачу",
    "modal.importStoriesTitle": "Импорт задач",
    "notice.importedStories": ({ count }) => `${count} ${getRussianPlural(Number(count), "задача импортирована", "задачи импортированы", "задач импортировано")}.`,
    "notice.joinedRoom": "Вы вошли в комнату.",
    "notice.roomCreated": "Комната создана.",
    "participant.spectator": "Наблюдатель",
    "participant.voted": "Проголосовал",
    "participant.waiting": "Ожидает",
    "placeholder.description": "Подробное описание задачи",
    "placeholder.link": "https://jira.example.org/browse/TASK-200",
    "placeholder.linkPattern": "https://jira.company.org/browse/{VALUE}",
    "placeholder.roomCode": "ABC123",
    "placeholder.title": "Хорошая задача",
    "setup.heading": "Подключите Supabase, чтобы начать планирование",
    "setup.instructionsAfterMigration": "затем скопируйте",
    "setup.instructionsIntro": "Создайте облачный проект Supabase, выполните SQL-миграцию из",
    "setup.instructionsOutro": "и укажите URL проекта и anon key.",
    "setup.instructionsTo": "в",
    "share.description": "Поделитесь кодом комнаты или скопируйте текущую ссылку.",
    "state.noStorySelected": "Задача не выбрана",
    "state.archiveEmpty": "В архиве пока нет задач.",
    "state.noMatchingEstimate": "Задач с такой оценкой пока нет.",
    "state.revealed": "Открыто",
    "state.voting": "Голосование",
    "voting.hiddenResults": "Голоса скрыты, пока фасилитатор не покажет их.",
  },
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getRussianPlural(count: number, one: string, few: string, many: string) {
  const absolute = Math.abs(count);
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

function detectLanguage(): Language {
  const savedLanguage = localStorage.getItem(storageKey);
  if (savedLanguage === "en" || savedLanguage === "ru") {
    return savedLanguage;
  }

  const browserLanguages = navigator.languages.length ? navigator.languages : [navigator.language];
  return browserLanguages.some((item) => item.toLocaleLowerCase().startsWith("ru")) ? "ru" : "en";
}

function formatTranslation(value: TranslationValue, params: TranslationParams) {
  if (typeof value === "function") {
    return value(params);
  }

  return value.replace(/\{(\w+)\}/g, (match, key) => String(params[key] ?? match));
}

export function translateError(error: unknown, t: I18nContextValue["t"], fallbackMessage: string) {
  if (isAppError(error)) {
    return t(`error.${error.code}`);
  }

  return fallbackMessage;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, params: TranslationParams = {}) => {
      const value = translations[language][key] ?? translations.en[key];
      return value ? formatTranslation(value, params) : key;
    };

    return {
      language,
      setLanguage: setLanguageState,
      t,
    };
  }, [language]);

  useEffect(() => {
    localStorage.setItem(storageKey, language);
    document.documentElement.lang = language;
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }

  return context;
}
