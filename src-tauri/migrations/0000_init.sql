CREATE TABLE `daily_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_day` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_daily_notes_day` ON `daily_notes` (`local_day`);--> statement-breakpoint
CREATE TABLE `day_rollup` (
	`local_day` text PRIMARY KEY NOT NULL,
	`tasks_total` integer DEFAULT 0 NOT NULL,
	`tasks_completed` integer DEFAULT 0 NOT NULL,
	`focus_seconds` integer DEFAULT 0 NOT NULL,
	`break_seconds` integer DEFAULT 0 NOT NULL,
	`session_count` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT 'none' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "ck_day_rollup_color" CHECK("day_rollup"."color" IN ('green','yellow','red','none'))
);
--> statement-breakpoint
CREATE TABLE `session_intervals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`phase` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_intervals_phase" CHECK("session_intervals"."phase" IN ('focus','short_break','long_break'))
);
--> statement-breakpoint
CREATE INDEX `idx_intervals_session` ON `session_intervals` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timer_id` integer,
	`study_method_id` integer,
	`timer_name` text,
	`method_kind` text,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`local_day` text NOT NULL,
	`accumulated_ms` integer DEFAULT 0 NOT NULL,
	`last_tick_at` integer,
	`focus_seconds` integer DEFAULT 0 NOT NULL,
	`break_seconds` integer DEFAULT 0 NOT NULL,
	`completed_cycles` integer DEFAULT 0 NOT NULL,
	`target_seconds` integer,
	`interrupted_count` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`timer_id`) REFERENCES `timers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`study_method_id`) REFERENCES `study_methods`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_sessions_status" CHECK("sessions"."status" IN ('running','paused','completed','abandoned','recovered'))
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_local_day` ON `sessions` (`local_day`);--> statement-breakpoint
CREATE INDEX `idx_sessions_started_at` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_status` ON `sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sessions_active` ON `sessions` (`status`,`last_tick_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`type` text DEFAULT 'string' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "ck_settings_type" CHECK("settings"."type" IN ('string','number','boolean','json'))
);
--> statement-breakpoint
CREATE TABLE `streak_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_day` text NOT NULL,
	`qualified` integer DEFAULT true NOT NULL,
	`restored` integer DEFAULT false NOT NULL,
	`tasks_completed` integer DEFAULT 0 NOT NULL,
	`focus_seconds` integer DEFAULT 0 NOT NULL,
	`restored_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_streak_days_day` ON `streak_days` (`local_day`);--> statement-breakpoint
CREATE TABLE `streak_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`last_qualified_day` text,
	`restores_used` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_methods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`focus_seconds` integer DEFAULT 1500 NOT NULL,
	`short_break_seconds` integer DEFAULT 300 NOT NULL,
	`long_break_seconds` integer DEFAULT 900 NOT NULL,
	`cycles_before_long_break` integer DEFAULT 4 NOT NULL,
	`auto_start_break` integer DEFAULT false NOT NULL,
	`auto_start_next_focus` integer DEFAULT false NOT NULL,
	`target_seconds` integer,
	`is_system` integer DEFAULT false NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "ck_study_methods_kind" CHECK("study_methods"."kind" IN ('pomodoro','flowtime','deep_work','fifty_two_seventeen','custom')),
	CONSTRAINT "ck_study_methods_focus_pos" CHECK("study_methods"."focus_seconds" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_study_methods_kind` ON `study_methods` (`kind`);--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`type` text NOT NULL,
	`local_day` text NOT NULL,
	`at` integer NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_task_events_type" CHECK("task_events"."type" IN ('created','completed','uncompleted','edited','deleted','rescheduled'))
);
--> statement-breakpoint
CREATE INDEX `idx_task_events_task` ON `task_events` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_task_events_day` ON `task_events` (`local_day`);--> statement-breakpoint
CREATE INDEX `idx_task_events_at` ON `task_events` (`at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`local_day` text NOT NULL,
	`completed_at` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`estimate_minutes` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "ck_tasks_status" CHECK("tasks"."status" IN ('pending','completed'))
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_local_day` ON `tasks` (`local_day`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status_day` ON `tasks` (`status`,`local_day`);--> statement-breakpoint
CREATE INDEX `idx_tasks_deleted` ON `tasks` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `timers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#816EF7' NOT NULL,
	`study_method_id` integer,
	`target_seconds_override` integer,
	`is_archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`study_method_id`) REFERENCES `study_methods`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_timers_method` ON `timers` (`study_method_id`);