CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer,
	`account_number` text NOT NULL,
	`company_id` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_account_number_unique` ON `accounts` (`account_number`);--> statement-breakpoint
CREATE TABLE `balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`account_id` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balances_account_id_unique` ON `balances` (`account_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rejected_transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer,
	`batch_id` integer NOT NULL,
	`account_number_from` text NOT NULL,
	`account_number_to` text NOT NULL,
	`row_number` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`reason` text,
	FOREIGN KEY (`batch_id`) REFERENCES `transfer_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer,
	`batch_id` integer NOT NULL,
	`transferred_to_id` integer NOT NULL,
	`transferred_from_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `transfer_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transferred_to_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transferred_from_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transfer_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer,
	`processed_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`company_id` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
