CREATE TABLE "PrintedSheet" (
  "date" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "pdf" BYTEA NOT NULL,
  "printed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrintedSheet_pkey" PRIMARY KEY ("date", "kind")
);
