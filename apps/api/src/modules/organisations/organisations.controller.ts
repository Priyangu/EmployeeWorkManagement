import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UserRole, OrganisationStatus } from "@ewm/shared-types";
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { OrganisationsService } from "./organisations.service";
import { CreateOrganisationDto } from "./dto/create-organisation.dto";
import { UpdateOrganisationDto } from "./dto/update-organisation.dto";

@Controller("organisations")
export class OrganisationsController {
  constructor(private readonly organisationsService: OrganisationsService) {}

  // ── Tenant-scoped routes ─────────────────────────────────────────────
  // The organisation comes from the JWT via TenantGuard, never from the
  // request, which is what makes isolation hold by construction.

  @UseGuards(AuthGuard, TenantGuard)
  @Get("me")
  getMe(@CurrentUser() user: RequestUser) {
    return this.organisationsService.getById(user.organisationId!);
  }

  // Only the Org Admin of that tenant may edit its details.
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ORG_ADMIN)
  @Patch("me")
  patchMe(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateOrganisationDto,
  ) {
    return this.organisationsService.update(dto, user.organisationId!);
  }

  // ── Super Admin platform routes (no tenant context) ─────────────────
  // SUPER_ADMIN accounts have no organisationId, so TenantGuard correctly
  // doesn't apply here — these routes manage organisations themselves.

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrganisationDto) {
    return this.organisationsService.create(dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  list() {
    return this.organisationsService.list();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Get(":id")
  getById(@Param("id") id: string) {
    return this.organisationsService.getById(id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateOrganisationDto) {
    return this.organisationsService.update(dto, id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Post(":id/suspend")
  @HttpCode(HttpStatus.OK)
  suspend(@Param("id") id: string) {
    return this.organisationsService.setStatus(
      id,
      OrganisationStatus.SUSPENDED,
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Post(":id/activate")
  @HttpCode(HttpStatus.OK)
  activate(@Param("id") id: string) {
    return this.organisationsService.setStatus(id, OrganisationStatus.ACTIVE);
  }
}