import { PrismaClient, TaskPriority, TaskStatus, TimeEntrySource } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const DAY_MS = 24 * 3600 * 1000;

// Seed data: the Phase 3 auth accounts + Phase 4 org/employee profiles, plus
// realistic dummy content for Phases 5–8 (teams, projects, ~10 tasks,
// schedule blocks, time entries) so the web screens have something to show
// immediately after `pnpm --filter @ewm/api prisma:seed`.
//
// Idempotent: users/employees/teams/projects/tasks are upserted or created
// only when missing; schedule/time-entry rows are only seeded when the org
// has none yet (so re-seeding never duplicates calendar entries).
async function main() {
  const password = "Password123!";
  const passwordHash = await argon2.hash(password);

  async function ensureOrganisation(name: string) {
    const existing = await prisma.organisation.findFirst({ where: { name } });
    if (existing) return existing;
    return prisma.organisation.create({
      data: { name, timeZone: "Pacific/Auckland", country: "NZ" },
    });
  }

  const acme = await ensureOrganisation("Acme Ltd");
  const globex = await ensureOrganisation("Globex Corp");

  // ── 1. Users (login accounts) ───────────────────────────────────────────
  const users = [
    { email: "superadmin@ewm.test", role: "SUPER_ADMIN" as const },
    { email: "admin@ewm.test", role: "ORG_ADMIN" as const, organisationId: acme.id },
    { email: "manager@ewm.test", role: "MANAGER" as const, organisationId: acme.id },
    { email: "sarah@ewm.test", role: "MANAGER" as const, organisationId: acme.id },
    { email: "teamlead@ewm.test", role: "TEAM_LEAD" as const, organisationId: acme.id },
    { email: "employee@ewm.test", role: "EMPLOYEE" as const, organisationId: acme.id },
    { email: "dev1@ewm.test", role: "EMPLOYEE" as const, organisationId: acme.id },
    { email: "dev2@ewm.test", role: "EMPLOYEE" as const, organisationId: acme.id },
    { email: "designer@ewm.test", role: "EMPLOYEE" as const, organisationId: acme.id },
    { email: "disabled@ewm.test", role: "EMPLOYEE" as const, isActive: false, organisationId: acme.id },
    { email: "orgadmin@globex.test", role: "ORG_ADMIN" as const, organisationId: globex.id },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      // update re-syncs organisationId/role/isActive so re-seeding fixes drift
      update: {
        role: u.role,
        isActive: u.isActive ?? true,
        organisationId: u.organisationId,
      },
      create: {
        email: u.email,
        passwordHash,
        role: u.role,
        isActive: u.isActive ?? true,
        isEmailVerified: true,
        organisationId: u.organisationId,
      },
    });
  }

  // ── 2. Employee profiles (HR records) ──────────────────────────────────
  async function ensureEmployee(email: string, name: string, extra?: object) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return prisma.employee.upsert({
      where: { userId: user.id },
      update: {}, // don't overwrite real data on re-seed
      create: {
        organisationId: user.organisationId!,
        userId: user.id,
        name,
        ...extra,
      },
    });
  }

  const admin = await ensureEmployee("admin@ewm.test", "Acme Admin");
  const manager = await ensureEmployee("manager@ewm.test", "Acme Manager");
  const sarah = await ensureEmployee("sarah@ewm.test", "Sarah Chen");
  const teamLead = await ensureEmployee("teamlead@ewm.test", "Acme Team Lead");
  const employee = await ensureEmployee("employee@ewm.test", "Alex Employee");
  const dev1 = await ensureEmployee("dev1@ewm.test", "Dev One", {
    workingHours: {
      mon: { start: "09:00", end: "17:00" },
      tue: { start: "09:00", end: "17:00" },
      wed: { start: "09:00", end: "17:00" },
      thu: { start: "09:00", end: "17:00" },
      fri: { start: "09:00", end: "15:00" },
    },
  });
  const dev2 = await ensureEmployee("dev2@ewm.test", "Dev Two");
  const designer = await ensureEmployee("designer@ewm.test", "Dana Design");
  await ensureEmployee("disabled@ewm.test", "Disabled Demo", {
    employmentStatus: "DISABLED" as const,
  });
  await ensureEmployee("orgadmin@globex.test", "Globex Admin");


  // ── 3. Teams ────────────────────────────────────────────────────────────
  async function ensureTeam(name: string, managerEmployeeId: string | null) {
    const existing = await prisma.team.findFirst({
      where: { organisationId: acme.id, name },
    });
    if (existing) return existing;
    return prisma.team.create({
      data: {
        organisationId: acme.id,
        name,
        ...(managerEmployeeId ? { managerId: managerEmployeeId } : {}),
      },
    });
  }

  const platform = await ensureTeam("Platform", manager!.id);
  const mobile = await ensureTeam("Mobile", teamLead!.id);

  await prisma.employee.update({ where: { id: dev1!.id }, data: { teamId: platform.id } });
  await prisma.employee.update({ where: { id: dev2!.id }, data: { teamId: platform.id } });
  await prisma.employee.update({ where: { id: designer!.id }, data: { teamId: platform.id } });
  await prisma.employee.update({ where: { id: employee!.id }, data: { teamId: mobile.id } });

  // ── 4. Task categories ──────────────────────────────────────────────────
  async function ensureCategory(name: string) {
    const existing = await prisma.taskCategory.findFirst({
      where: { organisationId: acme.id, name },
    });
    if (existing) return existing;
    return prisma.taskCategory.create({ data: { organisationId: acme.id, name } });
  }

  const catDev = await ensureCategory("Development");
  const catDesign = await ensureCategory("Design");
  const catQA = await ensureCategory("QA");

  // ── 5. Projects ─────────────────────────────────────────────────────────
  async function ensureProject(name: string, data: object) {
    const existing = await prisma.project.findFirst({
      where: { organisationId: acme.id, name },
    });
    if (existing) return existing;
    return prisma.project.create({
      data: { organisationId: acme.id, name, ...data },
    });
  }

  const website = await ensureProject("Website Revamp", {
    description: "Refresh of the Acme marketing site",
    customer: "Acme Retail",
    status: "ACTIVE" as const,
    budgetHours: 160,
    projectManagerId: manager!.id,
  });
  const mobileApp = await ensureProject("Mobile App", {
    description: "Employee-facing Expo app",
    customer: "Internal",
    status: "PLANNED" as const,
    projectManagerId: teamLead!.id,
  });
  const portal = await ensureProject("Customer Portal", {
    description: "Self-service portal for customers",
    customer: "Globex Corp",
    status: "ACTIVE" as const,
    budgetHours: 240,
    budgetAmount: 48000,
    projectManagerId: sarah!.id,
  });

  if ([admin, manager, sarah, teamLead, employee, dev1, dev2, designer].some((e) => !e)) {
    throw new Error("Seed expected every seeded user to have an employee profile");
  }

  // Reporting lines: employees report to the team lead, leads to managers.
  await prisma.employee.update({ where: { id: teamLead!.id }, data: { managerId: manager!.id } });
  await prisma.employee.update({ where: { id: employee!.id }, data: { managerId: teamLead!.id } });
  await prisma.employee.update({ where: { id: dev1!.id }, data: { managerId: teamLead!.id } });
  await prisma.employee.update({ where: { id: dev2!.id }, data: { managerId: teamLead!.id } });
  await prisma.employee.update({ where: { id: designer!.id }, data: { managerId: teamLead!.id } });
  await prisma.employee.update({ where: { id: sarah!.id }, data: { managerId: admin!.id } });

  // ── 6. Tasks (≈10, spread across the projects) ──────────────────────────
  async function ensureTask(data: {
    projectId: string;
    categoryId?: string;
    title: string;
    description?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    estimatedMinutes?: number;
    dueInDays?: number;
    assigneeId?: string;
    createdById: string;
  }) {
    const existing = await prisma.task.findFirst({
      where: { organisationId: acme.id, title: data.title, deletedAt: null },
    });
    if (existing) return existing;
    const task = await prisma.task.create({
      data: {
        organisationId: acme.id,
        projectId: data.projectId,
        ...(data.categoryId ? { categoryId: data.categoryId } : {}),
        title: data.title,
        ...(data.description ? { description: data.description } : {}),
        ...(data.priority ? { priority: data.priority } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.estimatedMinutes ? { estimatedMinutes: data.estimatedMinutes } : {}),
        ...(data.dueInDays ? { dueDate: new Date(Date.now() + data.dueInDays * DAY_MS) } : {}),
        ...(data.assigneeId ? { assigneeId: data.assigneeId } : {}),
        createdById: data.createdById,
      },
    });
    if (data.assigneeId) {
      await prisma.taskAssignment.create({
        data: {
          taskId: task.id,
          employeeId: data.assigneeId,
          assignedById: data.createdById,
        },
      });
    }
    return task;
  }

  const t1 = await ensureTask({
    projectId: website.id, categoryId: catDesign.id, title: "Design homepage hero",
    description: "Hero section mockups + responsive behaviour",
    priority: "HIGH", status: "SCHEDULED", estimatedMinutes: 240, dueInDays: 7,
    assigneeId: designer!.id, createdById: manager!.id,
  });
  const t2 = await ensureTask({
    projectId: website.id, categoryId: catDev.id, title: "Implement nav component",
    description: "Sticky navigation with mobile menu",
    status: "IN_PROGRESS", estimatedMinutes: 480, dueInDays: 5,
    assigneeId: dev1!.id, createdById: manager!.id,
  });
  const t3 = await ensureTask({
    projectId: website.id, categoryId: catDev.id, title: "Migrate CMS content",
    description: "Move legacy pages into the new CMS",
    priority: "LOW", estimatedMinutes: 300, dueInDays: 14, createdById: manager!.id,
  });
  const t4 = await ensureTask({
    projectId: mobileApp.id, categoryId: catDev.id, title: "Set up Expo project",
    description: "Scaffold, env config, CI hook-up",
    priority: "HIGH", status: "IN_PROGRESS", estimatedMinutes: 120, dueInDays: 3,
    assigneeId: employee!.id, createdById: teamLead!.id,
  });
  const t5 = await ensureTask({
    projectId: mobileApp.id, categoryId: catDev.id, title: "Offline queue prototype",
    description: "Queue time entries offline, sync later",
    status: "BLOCKED", estimatedMinutes: 600, dueInDays: 10,
    assigneeId: dev2!.id, createdById: teamLead!.id,
  });
  const t6 = await ensureTask({
    projectId: mobileApp.id, categoryId: catDev.id, title: "Push notifications spike",
    description: "Evaluate Expo push + notification payloads",
    priority: "LOW", estimatedMinutes: 180, dueInDays: 12, createdById: teamLead!.id,
  });
  const t7 = await ensureTask({
    projectId: portal.id, categoryId: catDev.id, title: "Customer login flow",
    description: "Email + password login for the portal",
    priority: "URGENT", status: "IN_PROGRESS", estimatedMinutes: 480, dueInDays: 4,
    assigneeId: dev1!.id, createdById: sarah!.id,
  });
  const t8 = await ensureTask({
    projectId: portal.id, categoryId: catDev.id, title: "Session timeout policy",
    description: "Idle timeout + refresh-token rotation",
    status: "PAUSED", estimatedMinutes: 180, dueInDays: 8,
    assigneeId: dev2!.id, createdById: sarah!.id,
  });
  const t9 = await ensureTask({
    projectId: portal.id, categoryId: catQA.id, title: "Accessibility audit",
    description: "WCAG 2.1 AA spot-check of key screens",
    priority: "HIGH", status: "SCHEDULED", estimatedMinutes: 360, dueInDays: 9,
    assigneeId: employee!.id, createdById: sarah!.id,
  });
  const t10 = await ensureTask({
    projectId: website.id, categoryId: catQA.id, title: "Performance baseline",
    description: "Lighthouse baseline for the current build",
    status: "COMPLETED", estimatedMinutes: 240, dueInDays: -2,
    assigneeId: dev1!.id, createdById: manager!.id,
  });
  void t10;
  void t6;
  void t10;

  // ── 7. Schedule blocks (next working week, Mon–Fri) ─────────────────────
  // Only seeded while the org has none, so re-seeds never duplicate blocks.
  if ((await prisma.taskSchedule.count({ where: { organisationId: acme.id } })) === 0) {
    const now = new Date();
    // Next Monday 09:00 UTC (0 = Sunday … 6 = Saturday → days to add).
    const daysToMonday = (8 - now.getUTCDay()) % 7 || 7;
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToMonday, 9),
    );
    const at = (dayOffset: number, hour: number) =>
      new Date(monday.getTime() + dayOffset * DAY_MS + (hour - 9) * 3600 * 1000);

    const blocks = [
      { task: t1, employeeId: designer!.id, start: at(0, 9), end: at(0, 11) },
      { task: t2, employeeId: dev1!.id, start: at(0, 9), end: at(0, 12) },
      { task: t5, employeeId: dev2!.id, start: at(0, 13), end: at(0, 16) },
      { task: t7, employeeId: dev1!.id, start: at(1, 9), end: at(1, 12) },
      { task: t4, employeeId: employee!.id, start: at(1, 13), end: at(1, 16) },
      { task: t9, employeeId: employee!.id, start: at(2, 9), end: at(2, 12) },
      { task: t8, employeeId: dev2!.id, start: at(3, 9), end: at(3, 12) },
    ];
    await prisma.taskSchedule.createMany({
      data: blocks.map((b) => ({
        organisationId: acme.id,
        taskId: b.task!.id,
        employeeId: b.employeeId,
        scheduledStart: b.start,
        scheduledEnd: b.end,
      })),
    });
  }

  // ── 8. Time entries (last 7 days, all COMPLETED) ─────────────────────────
  // Only seeded while the org has none — a running timer must never be
  // clobbered by a re-seed.
  if ((await prisma.timeEntry.count({ where: { organisationId: acme.id } })) === 0) {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);
    const entries = [
      { task: t2, employeeId: dev1!.id, source: "TIMER", from: hoursAgo(72), to: hoursAgo(69) },
      { task: t1, employeeId: designer!.id, source: "TIMER", from: hoursAgo(70), to: hoursAgo(68) },
      { task: t7, employeeId: dev1!.id, source: "TIMER", from: hoursAgo(48), to: hoursAgo(44.5) },
      { task: t5, employeeId: dev2!.id, source: "TIMER", from: hoursAgo(47), to: hoursAgo(44) },
      { task: t4, employeeId: employee!.id, source: "TIMER", from: hoursAgo(24), to: hoursAgo(22.5) },
      { task: t3, employeeId: dev1!.id, source: "MANUAL", from: hoursAgo(20), to: hoursAgo(19), notes: "Manual: content migration prep" },
    ];
    for (const e of entries) {
      await prisma.timeEntry.create({
        data: {
          organisationId: acme.id,
          employeeId: e.employeeId,
          taskId: e.task!.id,
          projectId: e.task!.projectId,
          status: "COMPLETED" as const,
          source: e.source as TimeEntrySource,
          startTime: e.from,
          endTime: e.to,
          durationSeconds: Math.round((e.to.getTime() - e.from.getTime()) / 1000),
          ...(e.notes ? { notes: e.notes } : {}),
        },
      });
    }
  }

  const counts = {
    users: await prisma.user.count(),
    employees: await prisma.employee.count({ where: { organisationId: acme.id } }),
    teams: await prisma.team.count({ where: { organisationId: acme.id } }),
    projects: await prisma.project.count({ where: { organisationId: acme.id } }),
    tasks: await prisma.task.count({ where: { organisationId: acme.id, deletedAt: null } }),
    schedules: await prisma.taskSchedule.count({ where: { organisationId: acme.id } }),
    timeEntries: await prisma.timeEntry.count({ where: { organisationId: acme.id } }),
  };
  console.log("Seed complete:", counts);
  console.log("Password for every seeded account: Password123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

