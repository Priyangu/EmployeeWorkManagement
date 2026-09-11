-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('TIMER', 'MANUAL', 'IMPORTED');

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'RUNNING',
    "source" "TimeEntrySource" NOT NULL DEFAULT 'TIMER',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "pausedSeconds" INTEGER NOT NULL DEFAULT 0,
    "pauseStartedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "notes" TEXT,
    "editedById" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValueJson" JSONB,
    "newValueJson" JSONB,
    "timeEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_entries_organisationId_idx" ON "time_entries"("organisationId");

-- CreateIndex
CREATE INDEX "time_entries_employeeId_idx" ON "time_entries"("employeeId");

-- CreateIndex
CREATE INDEX "time_entries_taskId_idx" ON "time_entries"("taskId");

-- CreateIndex
CREATE INDEX "audit_logs_organisationId_idx" ON "audit_logs"("organisationId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
