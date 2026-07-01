ALTER TABLE `sessions` ADD `task_id` integer REFERENCES tasks(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `spent_seconds` integer DEFAULT 0 NOT NULL;