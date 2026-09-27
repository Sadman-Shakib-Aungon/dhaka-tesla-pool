import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);
  await prisma.ride.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();

  const jashim = await prisma.user.create({
    data: { name: "Jashim", phone: "01700000001", passwordHash, role: "DRIVER" },
  });
  await prisma.user.createMany({
    data: [
      { name: "Nusrat", phone: "01700000002", passwordHash, role: "PASSENGER" },
      { name: "Rafiq", phone: "01700000003", passwordHash, role: "PASSENGER" },
      { name: "Shirin", phone: "01700000004", passwordHash, role: "PASSENGER" },
    ],
  });
  await prisma.vehicle.create({
    data: { name: "Bullet", plateNo: "DHAKA-METRO-GA-25-7777", capacity: 3, driverId: jashim.id },
  });
  console.log("Seed complete. Demo password for PRD characters: demo1234");
}
main().catch(console.error).finally(() => prisma.$disconnect());
