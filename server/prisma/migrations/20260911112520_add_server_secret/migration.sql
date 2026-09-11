-- CreateTable
CREATE TABLE "ServerSecret" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "jwt_secret" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerSecret_pkey" PRIMARY KEY ("id")
);
