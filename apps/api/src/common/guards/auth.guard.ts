import { Injectable } from "@nestjs/common";
import { AuthGuard as PassportAuthGuard } from "@nestjs/passport";

// Every protected endpoint in the system goes through this guard.
// Tenant/role checks are separate guards (TenantGuard lands in Phase 3,
// RolesGuard below) so each guard has exactly one responsibility.
@Injectable()
export class AuthGuard extends PassportAuthGuard("jwt") {}
