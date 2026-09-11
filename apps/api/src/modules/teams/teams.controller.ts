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
import { UserRole } from "@ewm/shared-types";
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { TeamsService } from "./teams.service";
import { CreateTeamDto } from "./dto/create-team.dto";
import { UpdateTeamDto } from "./dto/update-team.dto";

// Same guard pattern as employees: tenant-scoped reads for any org member,
// writes restricted to ORG_ADMIN / MANAGER.
@UseGuards(AuthGuard, TenantGuard)
@Controller("teams")
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.teamsService.list(user.organisationId!);
  }

  @Get(":id")
  getById(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.teamsService.getById(user.organisationId!, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(user.organisationId!, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(user.organisationId!, id, dto);
  }
}
