CREATE TYPE "public"."notification_delivery_status" AS ENUM('SENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');--> statement-breakpoint
CREATE TABLE "evaluation_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"locked_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"level" integer NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'SENDING' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_once_per_recipient_unique" UNIQUE("notification_id","member_id","channel","level")
);
--> statement-breakpoint
CREATE TABLE "proactive_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"level" integer NOT NULL,
	"currency" text NOT NULL,
	"period" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "notification_status" NOT NULL,
	"status_reason" text,
	"first_detected_at" timestamp with time zone NOT NULL,
	"last_detected_at" timestamp with time zone NOT NULL,
	"last_notified_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proactive_notifications_household_event_key_unique" UNIQUE("household_id","event_key"),
	CONSTRAINT "proactive_notifications_level_positive" CHECK ("proactive_notifications"."level" > 0)
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_proactive_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."proactive_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_member_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_notifications" ADD CONSTRAINT "proactive_notifications_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_household_index" ON "notification_deliveries" USING btree ("household_id","updated_at");--> statement-breakpoint
CREATE INDEX "proactive_notifications_household_detected_index" ON "proactive_notifications" USING btree ("household_id","last_detected_at");