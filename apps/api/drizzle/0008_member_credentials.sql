CREATE TABLE "member_credentials" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_credentials_email_shape" CHECK ("member_credentials"."email" = lower(trim("member_credentials"."email")) and position('@' in "member_credentials"."email") > 1)
);
--> statement-breakpoint
ALTER TABLE "member_credentials" ADD CONSTRAINT "member_credentials_member_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_credentials_email_unique" ON "member_credentials" USING btree (lower("email"));