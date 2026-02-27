import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { apiKeyMiddleware } from "../middleware/auth.js";

const router = Router();

router.get("/", (req, res) => {
  try {
    res.json({
      success: true,
      routes: {
        v1: [
          "/api/v1/gym?token=YOURTOKEN",
          "/api/v1/members?token=YOURTOKEN",
          "/api/v1/attendance?token=YOURTOKEN",
        ],
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch api routes",
      details: error.message,
    });
  }
});

router.get("/v1/gym", apiKeyMiddleware, async (req, res) => {
  try {
    const gym = await prisma.gym.findUnique({
      where: {
        userId: req.userId,
      },
    });

    if (!gym) {
      return res.status(404).json({ error: "Gym not found" });
    }

    res.json({
      success: true,
      id: gym.id,
      name: gym.name,
      owner: gym.owner,
      description: gym.description,
      address: gym.address,
      timezone: gym.timezone,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch gym data",
      details: error.message,
    });
  }
});

router.get("/v1/members", apiKeyMiddleware, async (req, res) => {
  try {
    const gym = await prisma.gym.findUnique({
      where: { userId: req.userId },
    });

    if (!gym) return res.status(404).json({ error: "Gym not found" });

    const timezone = gym.timezone || "UTC";
    const now = new Date();
    const todayStr = new Date(
      now.toLocaleString("en-US", { timeZone: timezone }),
    )
      .toISOString()
      .split("T")[0];

    const members = await prisma.member.findMany({
      where: { gymId: gym.id },
      include: {
        attendance: {
          where: { date: new Date(todayStr) },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let active = 0,
      expired = 0,
      expiresSoon = 0;

    const membersList = members.map((m) => {
      let status = "active";
      let daysLeft = null;

      if (m.plan !== "lifetime" && m.expiryDate) {
        const daysRemaining = Math.ceil(
          (new Date(m.expiryDate) - now) / (1000 * 60 * 60 * 24),
        );
        daysLeft = daysRemaining;

        if (daysRemaining < 0) {
          status = "expired";
          expired++;
        } else if (daysRemaining <= 14) {
          status = "expiresSoon";
          expiresSoon++;
        } else {
          active++;
        }
      } else {
        active++;
      }

      return {
        id: m.id,
        name: m.name,
        plan: m.plan,
        status,
        duration: daysLeft,
        isAttended: m.attendance.length > 0,
        timestamp: m.createdAt,
        details: {
          email: m.email,
          phone: m.phone,
          birthday: m.birthday,
          note: m.note,
        },
      };
    });

    res.json({
      success: true,
      membersCount: {
        all: members.length,
        active,
        expiresSoon,
        expired,
      },
      membersList,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch members data",
      details: error.message,
    });
  }
});

router.get("/v1/attendance", apiKeyMiddleware, async (req, res) => {
  try {
    const gym = await prisma.gym.findUnique({
      where: { userId: req.userId },
    });

    if (!gym) {
      return res.status(404).json({ error: "Gym not found" });
    }

    const defaultAttendance = {
      day1: { attended: 0, absence: 0 },
      day2: { attended: 0, absence: 0 },
      day3: { attended: 0, absence: 0 },
      day4: { attended: 0, absence: 0 },
      day5: { attended: 0, absence: 0 },
      day6: { attended: 0, absence: 0 },
      day7: { attended: 0, absence: 0 },
    };

    const attendance = gym.attendanceHistory
      ? JSON.parse(gym.attendanceHistory)
      : defaultAttendance;

    res.json({
      success: true,
      attendance,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch attendance data",
      details: error.message,
    });
  }
});

export default router;
