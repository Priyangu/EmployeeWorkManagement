import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function makeContext(user: { role: string }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it("allows any authenticated user when no @Roles() metadata is set", () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext({ role: "EMPLOYEE" }))).toBe(true);
  });

  it("allows a user whose role is in the required list", () => {
    const reflector = {
      getAllAndOverride: () => ["MANAGER", "ORG_ADMIN"],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext({ role: "MANAGER" }))).toBe(true);
  });

  it("blocks a user whose role is not in the required list", () => {
    const reflector = {
      getAllAndOverride: () => ["ORG_ADMIN"],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext({ role: "EMPLOYEE" }))).toBe(false);
  });
});
