CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"contact_email" text,
	"may_contact" boolean DEFAULT false NOT NULL,
	"page_url" text,
	"user_agent" text,
	"app_version" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
