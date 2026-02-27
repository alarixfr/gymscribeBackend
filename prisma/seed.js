import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "gymscribe@gymscribe.gymscribe" },
    update: {},
    create: {
      email: "gymscribe@gymscribe.gymscribe",
      password: await bcrypt.hash("gymscribe", 10),
    },
  });

  console.log(
    `Demo/testing account initialized: ${admin.email}:${admin.password}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
