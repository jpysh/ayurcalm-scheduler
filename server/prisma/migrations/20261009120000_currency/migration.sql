-- The symbol before a price, set by the centre (#609).
ALTER TABLE "Settings" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'Rs';
