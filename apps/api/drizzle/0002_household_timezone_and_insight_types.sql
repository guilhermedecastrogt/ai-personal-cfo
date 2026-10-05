ALTER TABLE "insights" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."insight_type";--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('BUDGET_NEAR_LIMIT', 'BUDGET_EXCEEDED', 'SPENDING_INCREASE', 'UNUSUAL_SPENDING', 'RECURRING_EXPENSE', 'GOAL_PROGRESS', 'CASH_FLOW_WARNING');--> statement-breakpoint
ALTER TABLE "insights" ALTER COLUMN "type" SET DATA TYPE "public"."insight_type" USING "type"::"public"."insight_type";--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_timezone_not_blank" CHECK (length(trim("households"."timezone")) > 0);