DROP INDEX "ai_conversations_household_member_index";--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN "state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN "state_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_household_member_channel_unique" UNIQUE("household_id","member_id","channel");