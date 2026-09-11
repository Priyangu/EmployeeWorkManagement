import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ProjectResponse, ProjectStatus } from "@ewm/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateProjectDto } from "./dto/create-project.dto";
import type { UpdateProjectDto } from "./dto/update-project.dto";

// Allowed status transitions. Terminal states (COMPLETED/CANCELLED) have no
// outgoing edges — the update path rejects them outright.
const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// Every lookup is keyed by the JWT-derived organisationId (via TenantGuard);
// cross-tenant reads/writes are structurally impossible. The project manager
// reference is re-validated against the same org before any write.
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    projectManager: true,
    _count: { select: { tasks: { where: { deletedAt: null } } } },
  } as const;

  async list(
    organisationId: string,
    filters: { status?: string; customer?: string } = {},
  ): Promise<ProjectResponse[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        organisationId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status as ProjectStatus } : {}),
        ...(filters.customer
          ? { customer: { contains: filters.customer, mode: "insensitive" } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      include: this.include,
    });
    return projects.map((p) => this.toResponse(p));
  }

  async getById(organisationId: string, id: string): Promise<ProjectResponse> {
    const project = await this.findInOrgOrThrow(organisationId, id);
    return this.toResponse(project);
  }

  async create(
    organisationId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectResponse> {
    if (dto.projectManagerId) {
      await this.findEmployeeInOrgOrThrow(organisationId, dto.projectManagerId);
    }
    this.assertDateOrder(dto.startDate, dto.endDate);

    const project = await this.prisma.project.create({
      data: {
        organisationId,
        name: dto.name,
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.customer !== undefined ? { customer: dto.customer } : {}),
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.status ? { status: dto.status as ProjectStatus } : {}),
        ...(dto.budgetHours !== undefined ? { budgetHours: dto.budgetHours } : {}),
        ...(dto.budgetAmount !== undefined
          ? { budgetAmount: dto.budgetAmount }
          : {}),
        ...(dto.projectManagerId ? { projectManagerId: dto.projectManagerId } : {}),
      },
      include: this.include,
    });
    return this.toResponse(project);
  }

  async update(
    organisationId: string,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    const existing = await this.findInOrgOrThrow(organisationId, id);

    // Terminal projects are frozen: no edits at all, not just status.
    const terminal: ProjectStatus[] = ["COMPLETED", "CANCELLED"];
    if (terminal.includes(existing.status as ProjectStatus)) {
      throw new BadRequestException(
        `Project is ${existing.status.toLowerCase()} and can no longer be modified`,
      );
    }

    if (dto.projectManagerId !== undefined && dto.projectManagerId !== null) {
      await this.findEmployeeInOrgOrThrow(organisationId, dto.projectManagerId);
    }
    this.assertDateOrder(
      dto.startDate !== undefined ? dto.startDate : undefined,
      dto.endDate !== undefined ? dto.endDate : undefined,
    );
    if (dto.status && dto.status !== existing.status) {
      const allowed = PROJECT_TRANSITIONS[existing.status as ProjectStatus] ?? [];
      if (!allowed.includes(dto.status as ProjectStatus)) {
        throw new BadRequestException(
          `Cannot move project from ${existing.status} to ${dto.status}`,
        );
      }
    }

    const project = await this.prisma.project.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.customer !== undefined ? { customer: dto.customer } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate === null ? null : new Date(dto.startDate) }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate === null ? null : new Date(dto.endDate) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status as ProjectStatus } : {}),
        ...(dto.budgetHours !== undefined ? { budgetHours: dto.budgetHours } : {}),
        ...(dto.budgetAmount !== undefined
          ? { budgetAmount: dto.budgetAmount }
          : {}),
        ...(dto.projectManagerId !== undefined
          ? { projectManagerId: dto.projectManagerId }
          : {}),
      },
      include: this.include,
    });
    return this.toResponse(project);
  }

  private assertDateOrder(start?: string | null, end?: string | null): void {
    if (start && end && new Date(end) < new Date(start)) {
      throw new BadRequestException("endDate cannot be before startDate");
    }
  }

  private async findInOrgOrThrow(organisationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organisationId, deletedAt: null },
      include: this.include,
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }
    return project;
  }

  private async findEmployeeInOrgOrThrow(
    organisationId: string,
    id: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organisationId, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException("Employee not found in this organisation");
    }
    return employee;
  }

  private toResponse(project: {
    id: string;
    organisationId: string;
    name: string;
    description: string | null;
    customer: string | null;
    startDate: Date | null;
    endDate: Date | null;
    status: string;
    budgetHours: number | null;
    budgetAmount: { toString(): string } | null;
    projectManagerId: string | null;
    projectManager?: { name: string } | null;
    _count?: { tasks: number };
    createdAt: Date;
    updatedAt: Date;
  }): ProjectResponse {
    return {
      id: project.id,
      organisationId: project.organisationId,
      name: project.name,
      description: project.description,
      customer: project.customer,
      startDate: project.startDate
        ? project.startDate.toISOString().slice(0, 10)
        : null,
      endDate: project.endDate
        ? project.endDate.toISOString().slice(0, 10)
        : null,
      status: project.status as ProjectStatus,
      budgetHours: project.budgetHours,
      budgetAmount: project.budgetAmount ? project.budgetAmount.toString() : null,
      projectManagerId: project.projectManagerId,
      projectManagerName: project.projectManager?.name ?? null,
      taskCount: project._count?.tasks ?? 0,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}
