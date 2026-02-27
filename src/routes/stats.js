import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

const CACHE_DURATION = 5 * 60 * 1000;
let statsCache = null;
let statsCacheTime = null;

router.get("/", async (req, res) => {
  try {
    const now = Date.now();

    if (statsCache && statsCacheTime && now - statsCacheTime < CACHE_DURATION) {
      return res.json({
        ...statsCache,
        cache: {
          cached: true,
          cacheAge: Math.floor((now - statsCacheTime) / 1000),
        },
      });
    }

    const totalAccounts = await prisma.user.count();
    const totalMembers = await prisma.member.count();

    const stats = {
      totalAccounts,
      totalMembers,
      timestamp: new Date().toISOString(),
    };

    statsCache = stats;
    statsCacheTime = now;

    res.json({
      ...stats,
      cache: {
        cached: false,
        cacheAge: null,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch stats",
      details: error.message,
    });
  }
});

export default router;
