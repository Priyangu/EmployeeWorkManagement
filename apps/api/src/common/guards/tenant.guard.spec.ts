import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { TenantGuard } from "./tenant.guard";

interface FakeRequest {
  user: { organisationId?: string | null };
  tenant?: { organisationId: string };
}

function makeContext(request: FakeRequest): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("TenantGuard", () => {
  it("attaches the tenant context for a user that belongs to an organisation", () => {
    const request: FakeRequest = { user: { organisationId: "org-1" } };
    const guard = new TenantGuard();
    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(request.tenant).toEqual({ organisationId: "org-1" });
  });

  it("rejects a user with no organisation with a 403 ForbiddenException", () => {
    const request: FakeRequest = { user: { organisationId: null } };
    const guard = new TenantGuard();
    expect(() => guard.canActivate(makeContext(request))).toThrow(ForbiddenException);
  });
});