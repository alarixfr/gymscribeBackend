import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { sanitizeJournal } from '../utils/sanitize.js';
import { validateAttendance } from '../utils/validate.js';

const router = Router();

router.get('/journals', authMiddleware, async (req, res) => {
  try {
    const gym = await prisma.gym.findUnique({
      where: { userId: req.userId }
    });
    
    if (!gym) {
      return res.status(404).json({ error: 'Gym not found' });
    }
    
    const journals = gym.journals ? JSON.parse(gym.journals) : [];
    
    res.json({
      success: true,
      journals
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load journals',
      details: error.message
    });
  }
});

router.put('/journals', authMiddleware, async (req, res) => {
  try {
    const { journals } = req.body;
    
    if (!journals || !Array.isArray(journals)) {
      return res.status(400).json({ error: 'Journals must be an array' });
    }
    
    if (journals.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 journals limit reached' });
    }
    
    const sanitizedJournals = journals.map(sanitizeJournal);
    
    await prisma.gym.update({
      where: { userId: req.userId },
      data: {
        journals: JSON.stringify(sanitizedJournals)
      }
    });
    
    res.json({
      success: true,
      message: 'Journals saved',
      count: sanitizedJournals.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save journals',
      details: error.message
    });
  }
});

router.delete('/journals', authMiddleware, async (req, res) => {
  try {
    await prisma.gym.update({
      where: { userId: req.userId },
      data: {
        journals: JSON.stringify([])
      }
    });
    
    res.json({
      success: true,
      message: 'Journals reset'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to reset journals',
      details: error.message
    });
  }
});

router.get('/attendance', authMiddleware, async (req, res) => {
  try {
    const gym = await prisma.gym.findUnique({
      where: { userId: req.userId }
    });
    
    if (!gym) {
      return res.status(404).json({ error: 'Gym not found' });
    }
    
    const defaultAttendance = {
      day1: { attended: 0, absence: 0 },
      day2: { attended: 0, absence: 0 },
      day3: { attended: 0, absence: 0 },
      day4: { attended: 0, absence: 0 },
      day5: { attended: 0, absence: 0 },
      day6: { attended: 0, absence: 0 },
      day7: { attended: 0, absence: 0 }
    };
    
    const attendance = gym.attendanceHistory
      ? JSON.parse(gym.attendanceHistory)
      : defaultAttendance;
      
    res.json({
      success: true,
      attendance
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load attendance',
      details: error.message
    });
  }
});

router.put('/attendance', authMiddleware, async (req, res) => {
  try {
    const { attendance } = req.body;
    
    if (!attendance || typeof attendance !== 'object') {
      return res.status(400).json({
        error: 'Invalid attendance data'
      });
    }
    
    if (!validateAttendance(attendance)) {
      return res.status(400).json({
        error: 'Invalid attendance structure'
      });
    }
    
    const allowedDays = [
      'day1',
      'day2',
      'day3',
      'day4',
      'day5',
      'day6',
      'day7'
    ];
    
    const providedDays = Object.keys(attendance);
    const hasInvalidDays = providedDays.some(
      (day) => !allowedDays.includes(day)
    );
    
    if (hasInvalidDays) {
      return res.status(400).json({
        error: 'Invalid attendance data key'
      });
    }
    
    const sanitizedAttendance = {};
    
    for (const day of allowedDays) {
      if (attendance[day]) {
        sanitizedAttendance[day] = {
          attended: Math.floor(attendance[day].attended),
          absence: Math.floor(attendance[day].absence)
        };
      } else {
        sanitizedAttendance[day] = { attended: 0, absence: 0 };
      }
    }
    
    await prisma.gym.update({
      where: { userId: req.userId },
      data: {
        attendanceHistory: JSON.stringify(sanitizedAttendance)
      }
    });
    
    res.json({
      success: true,
      message: 'Attendance saved'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save attendance',
      details: error.message
    });
  }
});

router.delete('/attendance', authMiddleware, async (req, res) => {
  try {
    const defaultAttendance = {
      day1: { attended: 0, absence: 0 },
      day2: { attended: 0, absence: 0 },
      day3: { attended: 0, absence: 0 },
      day4: { attended: 0, absence: 0 },
      day5: { attended: 0, absence: 0 },
      day6: { attended: 0, absence: 0 },
      day7: { attended: 0, absence: 0 }
    };
    
    await prisma.gym.update({
      where: { userId: req.userId },
      data: {
        attendanceHistory: JSON.stringify(defaultAttendance)
      }
    });
    
    res.json({
      success: true,
      message: 'Attendance reset'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to reset attendance',
      details: error.message
    });
  }
});

export default router;