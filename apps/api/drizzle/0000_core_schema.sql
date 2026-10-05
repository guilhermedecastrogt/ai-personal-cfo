CREATE TYPE "public"."account_type" AS ENUM('BANK', 'CASH', 'CREDIT_CARD', 'SAVINGS');--> statement-breakpoint
CREATE TYPE "public"."budget_period" AS ENUM('WEEKLY', 'MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('EXPENSE', 'INCOME');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('WHATSAPP', 'WEB');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('USER', 'ASSISTANT');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('ACTIVE', 'ACHIEVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('EMERGENCY_FUND', 'TRAVEL', 'PURCHASE', 'SAVINGS');--> statement-breakpoint
CREATE TYPE "public"."insight_severity" AS ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."insight_status" AS ENUM('PENDING', 'DELIVERED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('BUDGET_WARNING', 'SPENDING_TREND', 'ANOMALY', 'RECURRING_EXPENSE', 'GOAL_RISK', 'SAVINGS_RECOMMENDATION');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."recurring_expense_status" AS ENUM('OBSERVED', 'CONFIRMED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."expense_scope" AS ENUM('HOUSEHOLD', 'INDIVIDUAL');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'DIRECT_DEBIT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('WHATSAPP_TEXT', 'WHATSAPP_IMAGE', 'WEB', 'MANUAL', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('EXPENSE', 'INCOME', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_status" AS ENUM('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"owner_member_id" uuid,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" char(3) NOT NULL,
	"opening_balance_minor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_household_id_id_currency_unique" UNIQUE("household_id","id","currency"),
	CONSTRAINT "accounts_household_id_name_unique" UNIQUE("household_id","name"),
	CONSTRAINT "accounts_name_not_blank" CHECK (length(trim("accounts"."name")) > 0),
	CONSTRAINT "accounts_currency_format" CHECK ("accounts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"category_id" uuid,
	"period" "budget_period" NOT NULL,
	"limit_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"alert_threshold_percent" smallint DEFAULT 80 NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_household_category_period_currency_start_unique" UNIQUE NULLS NOT DISTINCT("household_id","category_id","period","currency","starts_on"),
	CONSTRAINT "budgets_limit_positive" CHECK ("budgets"."limit_minor" > 0),
	CONSTRAINT "budgets_currency_format" CHECK ("budgets"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "budgets_alert_threshold_range" CHECK ("budgets"."alert_threshold_percent" between 1 and 100),
	CONSTRAINT "budgets_ends_after_start" CHECK ("budgets"."ends_on" >= "budgets"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_parent_id_name_unique" UNIQUE NULLS NOT DISTINCT("parent_id","name"),
	CONSTRAINT "categories_name_not_blank" CHECK (length(trim("categories"."name")) > 0),
	CONSTRAINT "categories_not_own_parent" CHECK ("categories"."parent_id" <> "categories"."id")
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"channel" "conversation_channel" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"source_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "goal_type" NOT NULL,
	"target_amount_minor" bigint NOT NULL,
	"current_amount_minor" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) NOT NULL,
	"target_date" date,
	"status" "goal_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_name_not_blank" CHECK (length(trim("goals"."name")) > 0),
	CONSTRAINT "goals_target_amount_positive" CHECK ("goals"."target_amount_minor" > 0),
	CONSTRAINT "goals_current_amount_not_negative" CHECK ("goals"."current_amount_minor" >= 0),
	CONSTRAINT "goals_currency_format" CHECK ("goals"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_name_not_blank" CHECK (length(trim("households"."name")) > 0),
	CONSTRAINT "households_currency_format" CHECK ("households"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_household_id_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "members_name_not_blank" CHECK (length(trim("members"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_user_id" text NOT NULL,
	"phone_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_identities_provider_external_user_id_unique" UNIQUE("provider","external_user_id"),
	CONSTRAINT "whatsapp_identities_provider_not_blank" CHECK (length(trim("whatsapp_identities"."provider")) > 0),
	CONSTRAINT "whatsapp_identities_external_user_id_not_blank" CHECK (length(trim("whatsapp_identities"."external_user_id")) > 0),
	CONSTRAINT "whatsapp_identities_phone_number_e164" CHECK ("whatsapp_identities"."phone_number" ~ '^\+[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid,
	"type" "insight_type" NOT NULL,
	"severity" "insight_severity" NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "insight_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insights_title_not_blank" CHECK (length(trim("insights"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid,
	"category_id" uuid,
	"name" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"frequency" "recurrence_frequency" NOT NULL,
	"status" "recurring_expense_status" DEFAULT 'OBSERVED' NOT NULL,
	"last_charged_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_expenses_name_not_blank" CHECK (length(trim("recurring_expenses"."name")) > 0),
	CONSTRAINT "recurring_expenses_amount_positive" CHECK ("recurring_expenses"."amount_minor" > 0),
	CONSTRAINT "recurring_expenses_currency_format" CHECK ("recurring_expenses"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "monthly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"month" smallint NOT NULL,
	"currency" char(3) NOT NULL,
	"content" jsonb NOT NULL,
	"narrative" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_reports_household_year_month_currency_unique" UNIQUE("household_id","year","month","currency"),
	CONSTRAINT "monthly_reports_month_range" CHECK ("monthly_reports"."month" between 1 and 12),
	CONSTRAINT "monthly_reports_year_range" CHECK ("monthly_reports"."year" between 2000 and 9999),
	CONSTRAINT "monthly_reports_currency_format" CHECK ("monthly_reports"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"transfer_account_id" uuid,
	"type" "transaction_type" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"merchant" text,
	"description" text,
	"category_id" uuid,
	"expense_scope" "expense_scope" DEFAULT 'HOUSEHOLD' NOT NULL,
	"transaction_date" date NOT NULL,
	"payment_method" "payment_method",
	"source" "transaction_source" NOT NULL,
	"source_message_id" text,
	"ai_confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount_minor" > 0),
	CONSTRAINT "transactions_transfer_has_destination" CHECK (("transactions"."type" = 'TRANSFER') = ("transactions"."transfer_account_id" is not null)),
	CONSTRAINT "transactions_transfer_between_distinct_accounts" CHECK ("transactions"."transfer_account_id" <> "transactions"."account_id"),
	CONSTRAINT "transactions_transfer_has_no_category" CHECK ("transactions"."type" <> 'TRANSFER' or "transactions"."category_id" is null),
	CONSTRAINT "transactions_ai_confidence_range" CHECK ("transactions"."ai_confidence" >= 0 and "transactions"."ai_confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"status" "webhook_event_status" DEFAULT 'RECEIVED' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_provider_external_event_id_unique" UNIQUE("provider","external_event_id"),
	CONSTRAINT "webhook_events_provider_not_blank" CHECK (length(trim("webhook_events"."provider")) > 0),
	CONSTRAINT "webhook_events_external_event_id_not_blank" CHECK (length(trim("webhook_events"."external_event_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_member_fk" FOREIGN KEY ("household_id","owner_member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_member_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_identities" ADD CONSTRAINT "whatsapp_identities_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_member_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_member_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_member_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_fk" FOREIGN KEY ("household_id","account_id","currency") REFERENCES "public"."accounts"("household_id","id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_account_fk" FOREIGN KEY ("household_id","transfer_account_id","currency") REFERENCES "public"."accounts"("household_id","id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_household_member_index" ON "ai_conversations" USING btree ("household_id","member_id");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_created_index" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "goals_household_id_index" ON "goals" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "whatsapp_identities_member_id_index" ON "whatsapp_identities" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "insights_household_status_index" ON "insights" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "recurring_expenses_household_id_index" ON "recurring_expenses" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "transactions_household_date_index" ON "transactions" USING btree ("household_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_household_member_date_index" ON "transactions" USING btree ("household_id","member_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_household_category_date_index" ON "transactions" USING btree ("household_id","category_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_account_id_index" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_source_message_id_index" ON "transactions" USING btree ("source_message_id");