CREATE TABLE "member_default_accounts" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_household_id_id_unique" UNIQUE("household_id","id");--> statement-breakpoint
ALTER TABLE "member_default_accounts" ADD CONSTRAINT "member_default_accounts_member_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpointALTER TABLE "member_default_accounts" ADD CONSTRAINT "member_default_accounts_account_fk" FOREIGN KEY ("household_id","account_id") REFERENCES "public"."accounts"("household_id","id") ON DELETE no action ON UPDATE no action;
