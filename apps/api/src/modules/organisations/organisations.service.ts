import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  OrganisationResponse,
  OrganisationStatus,
} from "@ewm/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateOrganisationDto } from "./dto/create-organisation.dto";
import type { UpdateOrganisationDto } from "./dto/update-organisation.dto";

// All tenant-scoped lookups are keyed by the id that came from the JWT (via
// TenantGuard) or a SUPER_ADMIN path param — callers can never pass an
// arbitrary organisationId into a query, so cross-tenant reads are
// structurally impossible (the Phase 3 isolation test proves this).
@Injectable()
export class OrganisationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(organisationId: string): Promise<OrganisationResponse> {
    const org = await this.findOrganisationOrThrow(organisationId);
    return this.toResponse(org);
  }

  async update(
    dto: UpdateOrganisationDto,
    organisationId: string,
  ): Promise<OrganisationResponse> {
    await this.findOrganisationOrThrow(organisationId);
    const org = await this.prisma.organisation.update({
      where: { id: organisationId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.timeZone !== undefined ? { timeZone: dto.timeZone } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
      },
    });
    return this.toResponse(org);
  }

  async create(dto: CreateOrganisationDto): Promise<OrganisationResponse> {
    const org = await this.prisma.organisation.create({
      data: {
        name: dto.name,
        ...(dto.timeZone ? { timeZone: dto.timeZone } : {}),
        ...(dto.country ? { country: dto.country } : {}),
      },
    });
    return this.toResponse(org);
  }

  async list(): Promise<OrganisationResponse[]> {
    const orgs = await this.prisma.organisation.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return orgs.map((org) => this.toResponse(org));
  }

  async setStatus(
    organisationId: string,
    status: OrganisationStatus,
  ): Promise<OrganisationResponse> {
    await this.findOrganisationOrThrow(organisationId);
    const org = await this.prisma.organisation.update({
      where: { id: organisationId },
      data: { status },
    });
    return this.toResponse(org);
  }

  private async findOrganisationOrThrow(organisationId: string) {
    const org = await this.prisma.organisation.findFirst({
      where: { id: organisationId, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException("Organisation not found");
    }
    return org;
  }

  private toResponse(org: {
    id: string;
    name: string;
    timeZone: string;
    country: string;
    // string (not the shared enum) so Prisma's nominally-typed enum is
    // accepted here; the values are identical, so the cast below is safe.
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): OrganisationResponse {
    return {
      id: org.id,
      name: org.name,
      timeZone: org.timeZone,
      country: org.country,
      status: org.status as OrganisationStatus,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }
}