-- CreateTable
CREATE TABLE "GlobalSchedule" (
    "key" TEXT NOT NULL,
    "value_date" TIMESTAMP(3) NOT NULL,
    "last_execution" TIMESTAMP(3),

    CONSTRAINT "GlobalSchedule_pkey" PRIMARY KEY ("key")
);
