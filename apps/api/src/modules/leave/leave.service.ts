// Phase 9: Leave — request/approve/reject workflow. Employees submit requests
// for annual/sick/other leave; managers approve/reject with a reason.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { LeaveRequestResponse, LeaveStatus } from "@ewm/shared-types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import type { CreateLeaveRequestDto, RejectLeaveRequestDto } from "./dto/leave.dto";

const MANAGER_LEVEL_ROLES = new Set(["ORG_ADMIN", "MANAGER", "TEAM_LEAD"]);

type LeaveRow = Prisma.LeaveRequestGetPayload<{
  include: { employee: { select: { name: true } }; approvedBy: { select: { name: true } } };
}>;

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

    private readonly include = {
    employee: { select: { name: true } },
    approvedBy: { select: { email: true } },
  } as const;

  private async resolveSelfEmployee(organisationId: string, user: RequestUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: user.id, organisationId, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException("Your user account has no Employee profile in this organisation");
    }
    return employee;
  }

  private toResponse(l: LeaveRow): LeaveRequestResponse {
    return {
      id: l.id,
      organisationId: l.organisationId,
      employeeId: l.employeeId,
      employeeName: l.employee?.name ?? "—",
      type: l.type,
      startDate: l.startDate.toISOString(),
      endDate: l.endDate.toISOString(),
      reason: l.reason,
      status: l.status as LeaveStatus,
      approvedById: l.approvedById,
      approvedByName: l.approvedBy?.email ?? null,
      approvedAt: l.approvedAt ? l.approvedAt.toISOString() : null,
      rejectionReason: l.rejectionReason,
      createdAt: l.createdAt.toISOString(),
            updatedAt: l.updatedAt.toISOString(),
    };
  }

  // GET /leave-requests?type=&status=&employeeId=
  async list(
    organisationId: string,
    user: RequestUser,
    query: { type?: string; status?: string; employeeId?: string },
  ): Promise<LeaveRequestResponse[]> {
    const where: Prisma.LeaveRequestWhereInput = { organisationId };

    if (query.employeeId) {
      if (!MANAGER_LEVEL_ROLES.has(user.role)) {
        const self = await this.resolveSelfEmployee(organisationId, user);
        if (query.employeeId !== self.id) {
          throw new ForbiddenException("You may only view your own leave requests");
        }
      }
      where.employeeId = query.employeeId;
    } else if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      const self = await this.resolveSelfEmployee(organisationId, user);
      where.employeeId = self.id;
    }

        if (query.type) where.type = query.type as any;
    if (query.status) where.status = query.status as any;

    const rows = await this.prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: this.include,
    });

    return rows.map((l) => this.toResponse(l));
  }

  // POST /leave-requests
  async create(
    organisationId: string,
    user: RequestUser,
    dto: CreateLeaveRequestDto,
  ): Promise<LeaveRequestResponse> {
    const self = await this.resolveSelfEmployee(organisationId, user);

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (start > end) {
      throw new BadRequestException("Start date must be before end date");
    }

    const record = await this.prisma.leaveRequest.create({
      data: {
        organisationId,
        employeeId: self.id,
        type: dto.type,
        startDate: start,
        endDate: end,
        reason: dto.reason ?? null,
        status: "PENDING",
      },
      include: this.include,
    });

    return this.toResponse(record);
  }

  // POST /leave-requests/:id/approve
  async approve(
    organisationId: string,
    user: RequestUser,
    id: string,
  ): Promise<LeaveRequestResponse> {
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      throw new ForbiddenException("Only managers can approve leave requests");
    }

    const l = await this.prisma.leaveRequest.findFirst({
      where: { id, organisationId },
      include: this.include,
    });
    if (!l) throw new NotFoundException("Leave request not found");

    if (l.status !== "PENDING") {
      throw new ConflictException(`Cannot approve a leave request with status ${l.status}`);
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: null,
      },
      include: this.include,
    });

    await this.prisma.auditLog.create({
      data: {
        organisationId,
        userId: user.id,
        action: "leave_request.approve",
        entityType: "LeaveRequest",
        entityId: l.id,
        oldValueJson: { status: l.status },
        newValueJson: { status: "APPROVED" },
      },
    });

    return this.toResponse(updated);
  }

  // POST /leave-requests/:id/reject
  async reject(
    organisationId: string,
    user: RequestUser,
    id: string,
    dto: RejectLeaveRequestDto,
  ): Promise<LeaveRequestResponse> {
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      throw new ForbiddenException("Only managers can reject leave requests");
    }

    const l = await this.prisma.leaveRequest.findFirst({
      where: { id, organisationId },
      include: this.include,
    });
    if (!l) throw new NotFoundException("Leave request not found");

    if (l.status !== "PENDING") {
      throw new ConflictException(`Cannot reject a leave request with status ${l.status}`);
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: dto.reason,
      },
      include: this.include,
    });

    await this.prisma.auditLog.create({
      data: {
        organisationId,
        userId: user.id,
        action: "leave_request.reject",
        entityType: "LeaveRequest",
        entityId: l.id,
        oldValueJson: { status: l.status },
        newValueJson: { status: "REJECTED", rejectionReason: dto.reason },
      },
    });

    return this.toResponse(updated);
  }
}
