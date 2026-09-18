ALTER TABLE "ServerSecret" ADD COLUMN "mcp_key_hash" TEXT;
ALTER TABLE "ServerSecret" ADD COLUMN "mcp_key_user_id" TEXT;
ALTER TABLE "ServerSecret" ADD COLUMN "mcp_key_created_at" TIMESTAMP(3);
ALTER TABLE "ServerSecret" ADD COLUMN "mcp_key_last_used_at" TIMESTAMP(3);
