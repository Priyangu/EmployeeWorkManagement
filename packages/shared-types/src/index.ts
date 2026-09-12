// Shared types/enums used by api, web, and mobile.
// Keep this package free of framework-specific imports (no Nest, no React,
// no React Native) so it can be consumed from any of the three apps.

export interface HealthCheckResponse {
  status: "ok";
  timestamp: string;
  service: string;
}

export type NotificationType =
  | "TASK_ASSIGNED"
  | "TIMESHEET_APPROVED"
  | "TIMESHEET_REJECTED";

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface DashboardTodayResponse {
  date: string;
  employeesWorking: number;
  tasksScheduled: number;
  tasksCompleted: number;
  overdueTasks: number;
  activeTasks: number;
}

export interface DashboardTeamWorkloadResponse {
  periodFrom: string;
  periodTo: string;
  employees: Array<{
    employeeId: string;
    employeeName: string;
    scheduledHours: number;
    actualHours: number;
    remainingTasks: number;
    capacityHours: number;
  }>;
}

export interface DashboardProjectPerformanceResponse {
  periodFrom: string;
  periodTo: string;
  projects: Array<{
    projectId: string;
    projectName: string;
    plannedHours: number;
    actualHours: number;
    varianceHours: number;
    completionPercent: number;
  }>;
}

// Core enums (added early since almost every later module depends on them).
// Extend this file as new modules land — do not duplicate these definitions
// in individual apps.

// NOTE: these are declared as const objects + type aliases rather than TS
// `enum`. The API dev server runs with Node's native TypeScript support
// (strip types only, no code transforms), which cannot load `enum`
// declarations. Plain const objects are runtime-valid either way and give
// the same `UserRole.X` / `OrganisationStatus.Y` usage.

export const UserRole = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ORG_ADMIN: "ORG_ADMIN",
  MANAGER: "MANAGER",
  TEAM_LEAD: "TEAM_LEAD",
  EMPLOYEE: "EMPLOYEE",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const EmploymentStatus = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;

export type EmploymentStatus = (typeof EmploymentStatus)[keyof typeof EmploymentStatus];

// ── Phase 4: Employees & Teams ───────────────────────────────────────────
export interface WorkingHours {
  // Free-form per-day schedule, e.g. { mon: { start: "09:00", end: "17:00" } }.
  // Validated lightly on the API (must be an object); interpreted by the UI.
  [day: string]: unknown;
}

export interface EmployeeResponse {
  id: string;
  organisationId: string;
  userId: string | null;
  email: string | null;
  role: string | null;
  name: string;
  phone: string | null;
  teamId: string | null;
  teamName: string | null;
  managerId: string | null;
  managerName: string | null;
  timeZone: string;
  workingHours: WorkingHours | null;
  employmentStatus: EmploymentStatus;
  isActive: boolean | null; // linked User.isActive, null when no linked user
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  emergencyContactEmail: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface TeamResponse {
  id: string;
  organisationId: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  memberCount: number;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface CreateEmployeeRequest {
  // Mode A (create login + profile together): email + password (+ optional role).
  // Mode B (link to existing user): userId.
  // Exactly one mode is required — the API rejects both/neither.
  email?: string;
  password?: string;
  role?: UserRole;
  userId?: string;
  name: string;
  phone?: string;
  teamId?: string;
  managerId?: string;
  timeZone?: string;
  workingHours?: WorkingHours;
}

export interface UpdateEmployeeRequest {
  name?: string;
  phone?: string | null;
  teamId?: string | null;
  managerId?: string | null;
  timeZone?: string;
  workingHours?: WorkingHours | null;
}

export interface CreateTeamRequest {
  name: string;
  managerId?: string;
}

export interface UpdateTeamRequest {
  name?: string;
  managerId?: string | null;
}

// ── Phase 5: Projects ────────────────────────────────────────────────────
export const ProjectStatus = {
  PLANNED: "PLANNED",
  ACTIVE: "ACTIVE",
  ON_HOLD: "ON_HOLD",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export interface ProjectResponse {
  id: string;
  organisationId: string;
  name: string;
  description: string | null;
  customer: string | null;
  startDate: string | null; // ISO-8601 date
  endDate: string | null; // ISO-8601 date
  status: ProjectStatus;
  budgetHours: number | null;
  budgetAmount: string | null; // Decimal serialised as string
  projectManagerId: string | null;
  projectManagerName: string | null;
  taskCount: number;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  customer?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  status?: ProjectStatus;
  budgetHours?: number;
  budgetAmount?: number;
  projectManagerId?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
  customer?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: ProjectStatus;
  budgetHours?: number | null;
  budgetAmount?: number | null;
  projectManagerId?: string | null;
}

// ── Phase 6: Tasks ───────────────────────────────────────────────────────
export const TaskStatus = {
  NOT_STARTED: "NOT_STARTED",
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  BLOCKED: "BLOCKED",
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export interface TaskResponse {
  id: string;
  organisationId: string;
  projectId: string;
  projectName: string;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  estimatedMinutes: number | null;
  dueDate: string | null; // ISO-8601
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface TaskCategoryResponse {
  id: string;
  organisationId: string;
  name: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

// ── Phase 7: Scheduling ─────────────────────────────────────────────────
export interface TaskScheduleResponse {
  id: string;
  organisationId: string;
  taskId: string;
  taskTitle: string;
  employeeId: string;
  employeeName: string;
  scheduledStart: string; // ISO-8601 (UTC)
  scheduledEnd: string; // ISO-8601 (UTC)
  // Conflict warning (not a hard error): true when this block overlaps
  // another block for the same employee. conflictIds lists the overlapping
  // schedule ids.
  overlaps: boolean;
  conflictIds: string[];
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface CreateTaskScheduleRequest {
  taskId: string;
  employeeId: string;
  scheduledStart: string; // ISO-8601 (UTC)
  scheduledEnd: string; // ISO-8601 (UTC)
}

export interface UpdateTaskScheduleRequest {
  taskId?: string;
  employeeId?: string;
  scheduledStart?: string; // ISO-8601 (UTC)
  scheduledEnd?: string; // ISO-8601 (UTC)
}

// ── Phase 8: Time Tracking ───────────────────────────────────────────────
// Timer lifecycle: RUNNING ⇄ PAUSED (server re-derives durationSeconds at
// stop, net of pausedSeconds). One active timer per employee — enforced in
// the service with a 409 (the Phase 8 critical test). Manual entries arrive
// COMPLETED with explicit start/end. Durations ride as seconds on the wire;
// the web/mobile clients format them for display.
export const TimeEntryStatus = {
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
} as const;

export type TimeEntryStatus = (typeof TimeEntryStatus)[keyof typeof TimeEntryStatus];

export const TimeEntrySource = {
  TIMER: "TIMER",
  MANUAL: "MANUAL",
} as const;

export type TimeEntrySource = (typeof TimeEntrySource)[keyof typeof TimeEntrySource];

export interface TimeEntryResponse {
  id: string;
  organisationId: string;
  employeeId: string;
  employeeName: string;
  taskId: string | null;
  taskTitle: string | null;
  status: TimeEntryStatus;
  source: TimeEntrySource;
  startTime: string; // ISO-8601 (UTC)
  endTime: string | null; // ISO-8601 (UTC); null while the timer runs
  pausedSeconds: number;
  durationSeconds: number | null; // null while the timer runs
  durationMinutes: number | null; // convenience for dashboards; null while running
  notes: string | null;
  editedAt: string | null; // ISO-8601
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface StartTimerRequest {
  employeeId?: string; // managers may start for someone else; defaults to self
  taskId?: string;
  notes?: string;
}

export interface StopTimerRequest {
  notes?: string;
}

export interface CreateManualTimeEntryRequest {
  employeeId?: string; // managers may log for someone else; defaults to self
  taskId?: string;
  startTime: string; // ISO-8601 (UTC)
  endTime: string; // ISO-8601 (UTC)
  notes?: string;
}

export interface UpdateTimeEntryRequest {
  taskId?: string | null;
  startTime?: string; // ISO-8601 (UTC)
  endTime?: string | null; // ISO-8601 (UTC); null re-opens the timer when permitted
  notes?: string | null;
  reason?: string; // required audit reason when editing someone else's entry
}

export interface TaskCommentResponse {
  id: string;
  taskId: string;
  userId: string;
  userEmail: string;
  body: string;
  createdAt: string; // ISO-8601
}

export interface TaskAttachmentResponse {
  id: string;
  taskId: string;
  storageKey: string;
  fileName: string;
  mimeType: string | null;
  uploadedById: string;
  createdAt: string; // ISO-8601
}

export interface CreateTaskCategoryRequest {
  name: string;
}

export interface CreateTaskRequest {
  projectId: string;
  categoryId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  estimatedMinutes?: number;
  dueDate?: string; // ISO-8601
  assigneeId?: string;
}

export interface UpdateTaskRequest {
  categoryId?: string | null;
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  estimatedMinutes?: number | null;
  dueDate?: string | null;
}

export interface AssignTaskRequest {
  employeeId: string;
}

export interface CreateTaskCommentRequest {
  body: string;
}

export interface CreateTaskAttachmentRequest {
  storageKey: string;
  fileName: string;
  mimeType?: string;
}


export const OrganisationStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

export type OrganisationStatus = (typeof OrganisationStatus)[keyof typeof OrganisationStatus];

export interface OrganisationResponse {
  id: string;
  name: string;
  timeZone: string;
  country: string;
  status: OrganisationStatus;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

// What POST /auth/login and POST /auth/refresh return. Shared with web/mobile
// so both frontends can implement the session flow against the same shapes.
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token TTL in seconds
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ── Phase 9: Timesheets, Attendance & Leave ────────────────────────────────

export const TimesheetStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type TimesheetStatus = (typeof TimesheetStatus)[keyof typeof TimesheetStatus];

export const LeaveType = {
  ANNUAL: "ANNUAL",
  SICK: "SICK",
  OTHER: "OTHER",
} as const;

export type LeaveType = (typeof LeaveType)[keyof typeof LeaveType];

export const LeaveStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type LeaveStatus = (typeof LeaveStatus)[keyof typeof LeaveStatus];

export interface TimesheetResponse {
  id: string;
  organisationId: string;
  employeeId: string;
  employeeName: string;
  periodStart: string; // ISO-8601 (Monday 00:00 UTC)
  periodEnd: string;   // ISO-8601 (Sunday 23:59 UTC)
  status: TimesheetStatus;
  totalMinutes: number;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  version: number;
  parentTimesheetId: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export const TimesheetSummaryGranularity = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;

export type TimesheetSummaryGranularity =
  (typeof TimesheetSummaryGranularity)[keyof typeof TimesheetSummaryGranularity];

export interface TimesheetSummaryResponse {
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
}

export interface CreateTimesheetRequest {
  employeeId?: string; // managers may create for someone else; defaults to self
  periodStart: string; // ISO-8601 (Monday 00:00 UTC)
}

export interface SubmitTimesheetRequest {
  // No body fields needed — submission is a state transition.
  // Rejection reason is provided in the reject call, not submit.
}

export interface RejectTimesheetRequest {
  reason: string;
}

export interface AttendanceResponse {
  id: string;
  organisationId: string;
  employeeId: string;
  employeeName: string;
  clockIn: string;  // ISO-8601 (UTC)
  clockOut: string | null; // ISO-8601 (UTC); null if still clocked in
  breakMinutes: number;
  isLate: boolean;
  isEarlyDeparture: boolean;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface ClockInRequest {
  // Server stamps clockIn = now(); optional notes for break/late context.
}

export interface ClockOutRequest {
  breakMinutes?: number;
}

export interface LeaveRequestResponse {
  id: string;
  organisationId: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  startDate: string; // ISO-8601 (UTC)
  endDate: string;   // ISO-8601 (UTC)
  reason: string | null;
  status: LeaveStatus;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface CreateLeaveRequestRequest {
  type: LeaveType;
  startDate: string; // ISO-8601 (UTC)
  endDate: string;   // ISO-8601 (UTC)
  reason?: string;
}

export interface ApproveLeaveRequestRequest {
  // Approval is an unconditional state transition; no reason needed.
}

export interface RejectLeaveRequestRequest {
  reason: string;
}
