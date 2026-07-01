ALTER TABLE `sessions` ADD `running_since_utc` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `protocol_json` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `block_index` integer DEFAULT 0 NOT NULL;