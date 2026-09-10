import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@ewm/shared-types";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { RequestUser } from "../../modules/auth/strategies/jwt.strategy";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() on the route means "any authenticated user" — the
    // AuthGuard has already run by this point.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user: RequestUser = context.switchToHttp().getRequest().user;
    return requiredRoles.includes(user.role as UserRole);
  }
}
