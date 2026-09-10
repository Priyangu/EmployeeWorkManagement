import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

// Phase 3 seed: two real organisations + a platform super admin, so both the
// tenant-isolation flows and the Super Admin org management can be exercised
// manually. Phase 4 replaces ad-hoc seeding with real Employee creation via
// the API.
async function main() {
  const password = "Password123!";
  const passwordHash = await argon2.hash(password);

  async function ensureOrganisation(name: string) {
    const existing = await prisma.organisation.findFirst({ where: { name } });
    if (existing) return existing;
    return prisma.organisation.create({
      data: { name, timeZone: "Pacific/Auckland", country: "NZ" },
    });
  }

  const acme = await ensureOrganisation("Acme Ltd");
  const globex = await ensureOrganisation("Globex Corp");

  const users = [
    { email: "superadmin@ewm.test", role: "SUPER_ADMIN" as const },
    { email: "admin@ewm.test", role: "ORG_ADMIN" as const, organisationId: acme.id },
    { email: "manager@ewm.test", role: "MANAGER" as const, organisationId: acme.id },
    { email: "employee@ewm.test", role: "EMPLOYEE" as const, organisationId: acme.id },
    { email: "disabled@ewm.test", role: "EMPLOYEE" as const, isActive: false, organisationId: acme.id },
    { email: "orgadmin@globex.test", role: "ORG_ADMIN" as const, organisationId: globex.id },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      // update re-syncs organisationId/role/isActive so re-seeding fixes drift
      update: {
        role: u.role,
        isActive: u.isActive ?? true,
        organisationId: u.organisationId,
      },
      create: {
        email: u.email,
        passwordHash,
        role: u.role,
        isActive: u.isActive ?? true,
        isEmailVerified: true,
        organisationId: u.organisationId,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${users.length} users across Acme Ltd, Globex Corp. Password: "${password}"`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
