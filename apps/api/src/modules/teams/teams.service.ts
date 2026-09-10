import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TeamResponse } from "@ewm/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateTeamDto } from "./dto/create-team.dto";
import type { UpdateTeamDto } from "./dto/update-team.dto";

// Tenant scoping identical to EmployeesService: every lookup is keyed by the
// JWT-derived organisationId. Team names are unique per org so different
// tenants can each have a "Platform" team without clashing.
@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organisationId: string): Promise<TeamResponse[]> {
    const teams = await this.prisma.team.findMany({
      where: { organisationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { manager: true, _count: { select: { members: true } } },
    });
    return teams.map((t) => this.toResponse(t));
  }

  async getById(organisationId: string, id: string): Promise<TeamResponse> {
    const team = await this.findInOrgOrThrow(organisationId, id);
    return this.toResponse(team);
  }

  async create(
    organisationId: string,
    dto: CreateTeamDto,
  ): Promise<TeamResponse> {
    if (dto.managerId) {
      await this.findEmployeeInOrgOrThrow(organisationId, dto.managerId);
    }
    const duplicate = await this.prisma.team.findFirst({
      where: { organisationId, name: dto.name, deletedAt: null },
    });
    if (duplicate) {
      throw new ConflictException(
        "A team with this name already exists in your organisation",
      );
    }
    const team = await this.prisma.team.create({
      data: {
        organisationId,
        name: dto.name,
        ...(dto.managerId ? { managerId: dto.managerId } : {}),
      },
      include: { manager: true, _count: { select: { members: true } } },
    });
    return this.toResponse(team);
  }

  async update(
    organisationId: string,
    id: string,
    dto: UpdateTeamDto,
  ): Promise<TeamResponse> {
    const existing = await this.findInOrgOrThrow(organisationId, id);
    if (dto.managerId !== undefined && dto.managerId !== null) {
      await this.findEmployeeInOrgOrThrow(organisationId, dto.managerId);
    }
    if (dto.name !== undefined && dto.name !== existing.name) {
      const duplicate = await this.prisma.team.findFirst({
        where: {
          organisationId,
          name: dto.name,
          deletedAt: null,
          NOT: { id: existing.id },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          "A team with this name already exists in your organisation",
        );
      }
    }
    const team = await this.prisma.team.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
      },
      include: { manager: true, _count: { select: { members: true } } },
    });
    return this.toResponse(team);
  }

  private async findInOrgOrThrow(organisationId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, organisationId, deletedAt: null },
      include: { manager: true, _count: { select: { members: true } } },
    });
    if (!team) {
      throw new NotFoundException("Team not found");
    }
    return team;
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

  private toResponse(team: {
    id: string;
    organisationId: string;
    name: string;
    managerId: string | null;
    manager?: { name: string } | null;
    _count?: { members: number };
    createdAt: Date;
    updatedAt: Date;
  }): TeamResponse {
    return {
      id: team.id,
      organisationId: team.organisationId,
      name: team.name,
      managerId: team.managerId,
      managerName: team.manager?.name ?? null,
      memberCount: team._count?.members ?? 0,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };
  }
}
