CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."announcement_tone" AS ENUM('info', 'warning', 'success');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('NEW', 'HANDLED');--> statement-breakpoint
CREATE TYPE "public"."contact_topic" AS ENUM('QUESTION', 'DEMO', 'PARTNERSHIP', 'SUPPORT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('WEEKLY', 'TWICE_WEEKLY', 'MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REFUSED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('ACTIVE', 'LEFT', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('INVITATION_RECEIVED', 'INVITATION_ACCEPTED', 'INVITATION_REFUSED', 'DUE_SOON', 'DUE_OVERDUE', 'PAYMENT_DECLARED', 'PAYMENT_VALIDATED', 'PAYMENT_REJECTED', 'ROTATION_SOON');--> statement-breakpoint
CREATE TYPE "public"."obligation_status" AS ENUM('PENDING', 'DECLARED', 'PAID', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('DECLARED', 'PAID', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."plan_id" AS ENUM('FREE', 'PRO', 'ASSOCIATION');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('USER', 'SUPPORT', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."rotation_cycle_status" AS ENUM('ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."rotation_mode" AS ENUM('MANUAL');--> statement-breakpoint
CREATE TYPE "public"."rotation_status" AS ENUM('UPCOMING', 'CURRENT', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."staff_invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('TRIAL', 'ACTIVE');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."tontine_status" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"platform_role" "platform_role" DEFAULT 'USER' NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contribution_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"expected_amount" integer NOT NULL,
	"due_date" date NOT NULL,
	"status" "obligation_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_obligations_period_ticket_unique" UNIQUE("period_id","ticket_id"),
	CONSTRAINT "contribution_obligations_amount_positive" CHECK ("contribution_obligations"."expected_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "contribution_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"period_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"status" "period_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_periods_number_unique" UNIQUE("tontine_id","period_number")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"invited_email" text,
	"invited_phone" text,
	"invited_user_id" uuid,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_has_contact" CHECK ("invitations"."invited_email" is not null or "invitations"."invited_phone" is not null)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tontine_id" uuid,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obligation_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"payment_date" date NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"status" "payment_status" DEFAULT 'DECLARED' NOT NULL,
	"declared_by" uuid NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "rotation_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"status" "rotation_cycle_status" DEFAULT 'ACTIVE' NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rotation_cycles_size_positive" CHECK ("rotation_cycles"."size" >= 1)
);
--> statement-breakpoint
CREATE TABLE "rotation_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"cycle_id" uuid,
	"member_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"scheduled_date" date,
	"status" "rotation_status" DEFAULT 'UPCOMING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rotation_slots_position_positive" CHECK ("rotation_slots"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "tontine_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'MEMBER' NOT NULL,
	"status" "member_status" DEFAULT 'ACTIVE' NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tontine_members_tontine_user_unique" UNIQUE("tontine_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tontine_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"ticket_number" integer NOT NULL,
	"status" "ticket_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tontine_tickets_number_unique" UNIQUE("tontine_id","ticket_number"),
	CONSTRAINT "tontine_tickets_number_positive" CHECK ("tontine_tickets"."ticket_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "tontines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"contribution_amount" integer NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"frequency" "frequency" NOT NULL,
	"frequency_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_date" date NOT NULL,
	"expected_member_count" integer NOT NULL,
	"rotation_mode" "rotation_mode" DEFAULT 'MANUAL' NOT NULL,
	"multiple_tickets_allowed" boolean DEFAULT false NOT NULL,
	"max_tickets_per_member" integer DEFAULT 1 NOT NULL,
	"next_ticket_number" integer DEFAULT 1 NOT NULL,
	"status" "tontine_status" DEFAULT 'DRAFT' NOT NULL,
	"pauses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tontines_amount_positive" CHECK ("tontines"."contribution_amount" > 0),
	CONSTRAINT "tontines_members_positive" CHECK ("tontines"."expected_member_count" >= 2),
	CONSTRAINT "tontines_max_tickets_positive" CHECK ("tontines"."max_tickets_per_member" >= 1),
	CONSTRAINT "tontines_next_ticket_positive" CHECK ("tontines"."next_ticket_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "admin_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"tone" "announcement_tone" DEFAULT 'info' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"tontine_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"old_values" jsonb,
	"new_values" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"topic" "contact_topic" NOT NULL,
	"message" text NOT NULL,
	"status" "contact_status" DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"reply" text
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"number" text NOT NULL,
	"plan_id" "plan_id" NOT NULL,
	"plan_name" text NOT NULL,
	"amount" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	CONSTRAINT "invoices_amount_positive" CHECK ("invoices"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"key" text PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_settings" (
	"plan_id" "plan_id" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"monthly_price" integer NOT NULL,
	"limits" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "plan_settings_price_nonnegative" CHECK ("plan_settings"."monthly_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "staff_invitation_status" DEFAULT 'PENDING' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "staff_invitations_role_valid" CHECK ("staff_invitations"."role" in ('SUPPORT','SUPER_ADMIN'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" "plan_id" DEFAULT 'FREE' NOT NULL,
	"status" "subscription_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"trial_used" boolean DEFAULT false NOT NULL,
	"current_period_start" date,
	"current_period_end" date,
	"canceled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_obligations" ADD CONSTRAINT "contribution_obligations_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_obligations" ADD CONSTRAINT "contribution_obligations_period_id_contribution_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."contribution_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_obligations" ADD CONSTRAINT "contribution_obligations_member_id_tontine_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tontine_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_obligations" ADD CONSTRAINT "contribution_obligations_ticket_id_tontine_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tontine_tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_periods" ADD CONSTRAINT "contribution_periods_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_obligation_id_contribution_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."contribution_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_declared_by_users_id_fk" FOREIGN KEY ("declared_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_cycles" ADD CONSTRAINT "rotation_cycles_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_slots" ADD CONSTRAINT "rotation_slots_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_slots" ADD CONSTRAINT "rotation_slots_cycle_id_rotation_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."rotation_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_slots" ADD CONSTRAINT "rotation_slots_member_id_tontine_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tontine_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_slots" ADD CONSTRAINT "rotation_slots_ticket_id_tontine_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tontine_tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_members" ADD CONSTRAINT "tontine_members_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_members" ADD CONSTRAINT "tontine_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_tickets" ADD CONSTRAINT "tontine_tickets_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_tickets" ADD CONSTRAINT "tontine_tickets_member_id_tontine_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tontine_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_tickets" ADD CONSTRAINT "tontine_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontines" ADD CONSTRAINT "tontines_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD CONSTRAINT "plan_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_phone_unique" ON "user_profiles" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_platform_role_idx" ON "users" USING btree ("platform_role");--> statement-breakpoint
CREATE INDEX "contribution_obligations_tontine_idx" ON "contribution_obligations" USING btree ("tontine_id","due_date");--> statement-breakpoint
CREATE INDEX "contribution_obligations_member_idx" ON "contribution_obligations" USING btree ("member_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_tontine_idx" ON "invitations" USING btree ("tontine_id","status");--> statement-breakpoint
CREATE INDEX "invitations_user_idx" ON "invitations" USING btree ("invited_user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_unique" ON "notifications" USING btree ("user_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "payments_obligation_idx" ON "payments" USING btree ("obligation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_open_per_obligation" ON "payments" USING btree ("obligation_id") WHERE "payments"."status" in ('DECLARED','PAID');--> statement-breakpoint
CREATE INDEX "rotation_cycles_tontine_idx" ON "rotation_cycles" USING btree ("tontine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rotation_slots_one_live_per_ticket" ON "rotation_slots" USING btree ("ticket_id") WHERE "rotation_slots"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "rotation_slots_tontine_idx" ON "rotation_slots" USING btree ("tontine_id","position");--> statement-breakpoint
CREATE INDEX "rotation_slots_member_idx" ON "rotation_slots" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "tontine_members_user_idx" ON "tontine_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tontine_members_tontine_idx" ON "tontine_members" USING btree ("tontine_id","status");--> statement-breakpoint
CREATE INDEX "tontine_tickets_member_idx" ON "tontine_tickets" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "tontines_creator_idx" ON "tontines" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "tontines_status_idx" ON "tontines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "admin_notes_user_idx" ON "admin_notes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "announcements_active_idx" ON "announcements" USING btree ("active","ends_at");--> statement-breakpoint
CREATE INDEX "audit_logs_tontine_idx" ON "audit_logs" USING btree ("tontine_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_requests_status_idx" ON "contact_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contact_requests_email_idx" ON "contact_requests" USING btree ("email","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_period_unique" ON "invoices" USING btree ("subscription_id","period_start");--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_token_unique" ON "staff_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_unique" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan_id","status");