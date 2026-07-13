ALTER TABLE `leads` ADD `land_value` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `imp_value` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `leads` ADD `lon` real;--> statement-breakpoint
ALTER TABLE `leads` ADD `prop_class` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `parcel_type` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `absentee` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `leads` ADD `land_data` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `synced_at` integer;