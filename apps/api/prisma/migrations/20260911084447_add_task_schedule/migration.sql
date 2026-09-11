-- CreateTable
CREATE TABLE "task_schedules" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_schedules_organisationId_idx" ON "task_schedules"("organisationId");

-- CreateIndex
CREATE INDEX "task_schedules_employeeId_idx" ON "task_schedules"("employeeId");

-- CreateIndex
CREATE INDEX "task_schedules_scheduledStart_scheduledEnd_idx" ON "task_schedules"("scheduledStart", "scheduledEnd");

-- AddForeignKey
ALTER TABLE "task_schedules" ADD CONSTRAINT "task_schedules_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_schedules" ADD CONSTRAINT "task_schedules_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_schedules" ADD CONSTRAINT "task_schedules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
