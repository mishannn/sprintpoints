CREATE TABLE IF NOT EXISTS `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`estimate` text,
	`archived_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_issues_room` ON `issues` (`room_id`,`position`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`token` text NOT NULL,
	`is_spectator` integer DEFAULT 0 NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `participants_token_unique` ON `participants` (`token`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_participants_room` ON `participants` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`host_token` text NOT NULL,
	`owner_id` text,
	`card_set` text NOT NULL,
	`revealed` integer DEFAULT 0 NOT NULL,
	`active_issue_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `rooms_code_unique` ON `rooms` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `rooms_host_token_unique` ON `rooms` (`host_token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_votes_room` ON `votes` (`room_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_votes_issue_participant` ON `votes` (`issue_id`,`participant_id`);