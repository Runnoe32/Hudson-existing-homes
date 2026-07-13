CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parcel_id` text NOT NULL,
	`address` text,
	`municipality` text,
	`in_hudson_sd` integer DEFAULT false,
	`owner_name` text,
	`mailing_address` text,
	`acreage` real,
	`year_built` integer,
	`sqft` integer,
	`beds` integer,
	`assessed_value` integer,
	`est_market` integer,
	`lottery_credit` integer DEFAULT false,
	`tenure_years` integer,
	`source` text,
	`probate_case_no` text,
	`pr_name` text,
	`pr_attorney` text,
	`fit_score` integer DEFAULT 0,
	`motivation_score` integer DEFAULT 0,
	`total` integer DEFAULT 0,
	`status` text DEFAULT 'watchlist' NOT NULL,
	`letter1_date` text,
	`letter2_date` text,
	`response_date` text,
	`notes` text,
	`next_action` text,
	`next_action_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_parcel_id_unique` ON `leads` (`parcel_id`);--> statement-breakpoint
CREATE TABLE `notes_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer NOT NULL,
	`body` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
