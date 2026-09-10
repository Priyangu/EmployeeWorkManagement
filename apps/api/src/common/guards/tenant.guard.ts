import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { RequestUser } from "../../modules/auth/strategies/jwt.strategy";

export interface TenantContext {
  organisationId: string;
}

// Middle layer of the Auth → Tenant → Roles guard chain (Phase 3).
// Resolves the tenant from the JWT (never from the body/params — that's what
// makes cross-tenant spoofing impossible) and rejects accounts with no
// organisation: platform-level SUPER_ADMINs belong to no tenant and are
// therefore not allowed on tenant-scoped routes.
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (!user?.organisationId) {
      throw new ForbiddenException("This account has no organisation context");
    }

    request.tenant = { organisationId: user.organisationId } as TenantContext;
    return true;
  }
}