import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type AuthUser = { id: string; role: "PASSENGER" | "DRIVER"; name: string };
declare global { namespace Express { interface Request { user?: AuthUser } } }

const app = express();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET!;
const areas = ["Banani", "Gulshan", "Mohakhali", "Dhanmondi", "Mirpur", "Uttara", "Farmgate", "Bashundhara"];
const fares: Record<string, number> = {
  "Banani-Mohakhali": 10000, "Banani-Gulshan": 8000, "Gulshan-Banani": 8000,
  "Gulshan-Mohakhali": 10000, "Dhanmondi-Farmgate": 9000, "Uttara-Banani": 15000,
  "Mirpur-Farmgate": 12000,
};
const fareFor = (pickup: string, destination: string) => fares[`${pickup}-${destination}`] ?? 12000;
const publicUser = (u: any) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, balancePaisa: u.balancePaisa });

app.use(cors());
app.use(express.json());

function tokenFor(user: any) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, jwtSecret, { expiresIn: "7d" });
}
function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ message: "Sign in required." });
    req.user = jwt.verify(token, jwtSecret) as AuthUser;
    next();
  } catch { res.status(401).json({ message: "Session expired. Sign in again." }); }
}
function role(required: AuthUser["role"]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) =>
    req.user?.role === required ? next() : res.status(403).json({ message: `${required} access required.` });
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "dhaka-tesla-pool-api" }));
app.get("/api/bootstrap", (_req, res) => res.json({ areas }));

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, phone, password, role: userRole, vehicleName, plateNo, capacity } = req.body;
    if (!name || !phone || !password || !["PASSENGER", "DRIVER"].includes(userRole)) {
      return res.status(400).json({ message: "Name, phone, password and role are required." });
    }
    if (password.length < 6) return res.status(400).json({ message: "Password must contain at least 6 characters." });
    if (userRole === "DRIVER" && (!vehicleName || !plateNo)) {
      return res.status(400).json({ message: "Drivers must register a vehicle name and plate number." });
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name, phone, passwordHash: await bcrypt.hash(password, 10), role: userRole, balancePaisa: userRole === "PASSENGER" ? 500000 : 0,
          ...(userRole === "DRIVER" ? {
            drivenVehicle: { create: { name: vehicleName, plateNo, capacity: Number(capacity) || 3 } },
          } : {}),
        },
      });
      return created;
    });
    res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error: any) {
    res.status(error.code === "P2002" ? 409 : 400).json({ message: error.code === "P2002" ? "Phone or vehicle plate already exists." : error.message });
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { phone: String(req.body.phone || "") } });
    if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash))) {
      return res.status(401).json({ message: "Incorrect phone number or password." });
    }
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error) { next(error); }
});

app.get("/api/auth/me", auth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    res.json(user ? publicUser(user) : null);
  } catch (error) { next(error); }
});

app.get("/api/wallet", auth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    res.json({ balancePaisa: user?.balancePaisa ?? 0 });
  } catch (error) { next(error); }
});

app.get("/api/rides", auth, role("PASSENGER"), async (req, res, next) => {
  try {
    const rides = await prisma.ride.findMany({
      where: { passengerId: req.user!.id }, include: { vehicle: true }, orderBy: { requestedAt: "desc" },
    });
    res.json(rides);
  } catch (error) { next(error); }
});

app.post("/api/rides", auth, role("PASSENGER"), async (req, res, next) => {
  try {
    const { pickup, destination, requestedSeats = 1 } = req.body;
    if (!areas.includes(pickup) || !areas.includes(destination) || pickup === destination) {
      return res.status(400).json({ message: "Choose two different valid Dhaka areas." });
    }
    if (!Number.isInteger(requestedSeats) || requestedSeats < 1 || requestedSeats > 3) {
      return res.status(400).json({ message: "Seats must be between 1 and 3." });
    }

    const baseFarePaisa = fareFor(pickup, destination);
    const result = await prisma.$transaction(async (tx) => {
      const candidate = await tx.ride.findFirst({
        where: {
          pickup,
          vehicleId: { not: null },
          status: { in: ["ACCEPTED", "DRIVER_ARRIVED"] },
        },
        include: { vehicle: true },
        orderBy: { acceptedAt: "asc" },
      });

      if (candidate?.vehicle) {
        const occupied = await tx.ride.aggregate({
          where: {
            vehicleId: candidate.vehicle.id,
            status: { in: ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"] },
          },
          _sum: { requestedSeats: true },
        });

        if ((occupied._sum.requestedSeats || 0) + requestedSeats <= candidate.vehicle.capacity) {
          const discount = 2000;
          const matched = await tx.ride.create({
            data: {
              passengerId: req.user!.id,
              pickup, destination, requestedSeats,
              vehicleId: candidate.vehicle.id,
              status: "ACCEPTED",
              acceptedAt: new Date(),
              baseFarePaisa,
              farePaisa: Math.max(0, baseFarePaisa - discount),
            },
          });

          const poolMembers = await tx.ride.findMany({
            where: {
              vehicleId: candidate.vehicle.id,
              pickup,
              status: { in: ["ACCEPTED", "DRIVER_ARRIVED"] },
            },
            select: { id: true, baseFarePaisa: true },
          });

          for (const member of poolMembers) {
            await tx.ride.update({
              where: { id: member.id },
              data: { farePaisa: Math.max(0, member.baseFarePaisa - discount) },
            });
          }

          return { ride: matched, autoMatched: true };
        }
      }

      const requested = await tx.ride.create({
        data: {
          passengerId: req.user!.id,
          pickup, destination, requestedSeats,
          baseFarePaisa,
          farePaisa: baseFarePaisa,
        },
      });
      return { ride: requested, autoMatched: false };
    }, { isolationLevel: "Serializable" });

    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.get("/api/driver/dashboard", auth, role("DRIVER"), async (req, res, next) => {
  try {
    const [vehicle, pendingRequests] = await Promise.all([
      prisma.vehicle.findUnique({
        where: { driverId: req.user!.id },
        include: {
          rides: {
            where: { status: { in: ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"] } },
            include: { passenger: true },
            orderBy: { requestedAt: "asc" },
          },
        },
      }),
      prisma.ride.findMany({
        where: { status: "REQUESTED" },
        include: { passenger: true },
        orderBy: { requestedAt: "asc" },
      }),
    ]);

    if (!vehicle) return res.status(404).json({ message: "No vehicle is registered for this driver." });

    const occupiedSeats = vehicle.rides.reduce((total, ride) => total + ride.requestedSeats, 0);

    res.json({
      vehicle: { ...vehicle, rides: [...pendingRequests, ...vehicle.rides] },
      occupiedSeats,
      availableSeats: vehicle.capacity - occupiedSeats,
    });
  } catch (error) { next(error); }
});

app.post("/api/rides/:id/accept", auth, role("DRIVER"), async (req, res, next) => {
  try {
    const accepted = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findUnique({ where: { driverId: req.user!.id } });
      const ride = await tx.ride.findUnique({ where: { id: req.params.id } });
      if (!vehicle || !ride) throw new Error("Vehicle or ride not found.");
      if (ride.status !== "REQUESTED") throw new Error("Only requested rides can be accepted.");

      const used = await tx.ride.aggregate({
        where: { vehicleId: vehicle.id, status: { in: ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"] } },
        _sum: { requestedSeats: true },
      });
      if ((used._sum.requestedSeats || 0) + ride.requestedSeats > vehicle.capacity) {
        throw new Error("This vehicle has no remaining seat capacity.");
      }

      const currentPool = await tx.ride.findMany({
        where: {
          vehicleId: vehicle.id,
          status: { in: ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"] },
        },
        select: { pickup: true },
      });
      if (currentPool.some((member) => member.pickup !== ride.pickup)) {
        throw new Error("This vehicle already has a pool from a different pickup zone.");
      }

      return tx.ride.update({
        where: { id: ride.id }, data: { vehicleId: vehicle.id, status: "ACCEPTED", acceptedAt: new Date() },
      });
    }, { isolationLevel: "Serializable" });
    res.json(accepted);
  } catch (error) { next(error); }
});

app.patch("/api/rides/:id/status", auth, role("DRIVER"), async (req, res, next) => {
  try {
    const status = String(req.body.status || "");
    const result = await prisma.$transaction(async (tx) => {
      const ride = await tx.ride.findUnique({ where: { id: req.params.id } });
      const vehicle = await tx.vehicle.findUnique({ where: { driverId: req.user!.id } });
      const allowed: Record<string, string> = {
        DRIVER_ARRIVED: "ACCEPTED",
        STARTED: "DRIVER_ARRIVED",
        COMPLETED: "STARTED",
      };

      if (!ride || !vehicle || ride.vehicleId !== vehicle.id) throw new Error("Only the assigned driver may update this ride.");
      if (ride.status !== allowed[status]) throw new Error(`Cannot change ${ride.status} to ${status}.`);

      const times: Record<string, object> = {
        DRIVER_ARRIVED: { arrivedAt: new Date() },
        STARTED: { startedAt: new Date() },
        COMPLETED: { completedAt: new Date() },
      };

      const updated = await tx.ride.update({
        where: { id: ride.id },
        data: { status, ...times[status] } as any,
      });

      if (status === "COMPLETED" && !ride.paymentSettledAt) {
        const passenger = await tx.user.findUnique({ where: { id: ride.passengerId } });
        if (!passenger || passenger.balancePaisa < ride.farePaisa) throw new Error("Passenger wallet has insufficient balance.");

        await tx.user.update({
          where: { id: passenger.id },
          data: { balancePaisa: { decrement: ride.farePaisa } },
        });
        await tx.user.update({
          where: { id: req.user!.id },
          data: { balancePaisa: { increment: ride.farePaisa } },
        });
        return tx.ride.update({
          where: { id: ride.id },
          data: { paymentSettledAt: new Date() },
        });
      }
      return updated;
    }, { isolationLevel: "Serializable" });

    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/rides/:id/cancel", auth, role("PASSENGER"), async (req, res, next) => {
  try {
    const ride = await prisma.ride.findUnique({ where: { id: req.params.id } });
    if (!ride || ride.passengerId !== req.user!.id) return res.status(403).json({ message: "You can cancel only your own ride." });
    if (!["REQUESTED", "ACCEPTED"].includes(ride.status)) return res.status(400).json({ message: "This ride can no longer be cancelled." });
    res.json(await prisma.ride.update({ where: { id: ride.id }, data: { status: "CANCELLED", cancelledAt: new Date() } }));
  } catch (error) { next(error); }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(400).json({ message: error.message || "Request failed." });
});
app.listen(port, () => console.log(`Dhaka Tesla Pool API running at http://localhost:${port}`));
