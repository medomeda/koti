CREATE TYPE "public"."payment_proof_mode" AS ENUM('OFF', 'OPTIONAL', 'REQUIRED');--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "proof_id" uuid;--> statement-breakpoint
ALTER TABLE "tontines" ADD COLUMN "payment_proof_mode" "payment_proof_mode" DEFAULT 'OPTIONAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "tontines" ADD COLUMN "members_see_payments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_proofs_tontine_idx" ON "payment_proofs" USING btree ("tontine_id");--> statement-breakpoint
CREATE INDEX "payment_proofs_uploader_idx" ON "payment_proofs" USING btree ("uploaded_by","created_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_id_payment_proofs_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."payment_proofs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_proof_unique" ON "payments" USING btree ("proof_id") WHERE "payments"."proof_id" is not null;