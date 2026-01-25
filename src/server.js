import express from 'express';
import os from 'os';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createChallenge, verifySolution } from 'altcha-lib';

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.log('ENV: JWT SECRET MISSING');
  process.exit(1);
}

if (!process.env.ALTCHA_SECRET) {
  console.log('ENV: ALTCHA SECRET MISSING');
  process.exit(1);
}

const ALTCHA_HMAC_KEY = process.env.ALTCHA_SECRET;
const app = express();
const prisma = new PrismaClient();
const PORT = 8080;

const rateLimitStore = new Map();
const CACHE_DURATION = 5 * 60 * 1000;
let statsCache = null;
let statsCacheTime = null;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now - value.resetTime > 60000) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

function rateLimit(options = {}) {
  const {
    windowsMs = 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later'
  } = options;
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitStore.has(ip)) {
      rateLimitStore.set(ip, {
        count: 1,
        resetTime: now + windowsMs
      });
      return next();
    }
    
    const record = rateLimitStore.get(ip);
    
    if (now > record.resetTime) {
      rateLimitStore.set(ip, {
        count: 1,
        resetTime: now + windowsMs
      });
      return next();
    }
    
    record.count++;
    
    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      
      res.setHeader('Retry-After', RetryAfter);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message,
        retryAfter: `${retryAfter} seconds`
      });
    }
    
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - record.count);
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
    
    next();
  };
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-timezone');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

app.use(express.json());

app.use(
  rateLimit({
    windowsMs: 60 * 1000,
    max: 100
  })
);

const sanitize = (str, maxLength = 100) => {
  if (!str || str === 'none') return 'none';
  return String(str).trim().slice(0, maxLength);
};

const sanitizeJournal = (journal) => {
  return {
    id: String(journal.id || '').slice(0, 100),
    title: String(journal.title || '').trim().slice(0, 100),
    desc: String(journal.desc || '').trim().slice(0, 100),
    timestamp: journal.timestamp || Date.now()
  };
};

const validateAttendance = (data) => {
  const validStructure = {
    day1: { attended: 0, absence: 0},
    day2: { attended: 0, absence: 0},
    day3: { attended: 0, absence: 0},
    day4: { attended: 0, absence: 0},
    day5: { attended: 0, absence: 0},
    day6: { attended: 0, absence: 0},
    day7: { attended: 0, absence: 0}
  };
  
  for (const day in validStructure) {
    if (
      !data[day] ||
      typeof data[day].attended !== 'number' ||
      typeof data[day].absence !== 'number'
    ) {
      return false;
    }
  }
  
  return true;
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validatePhone = (phone) => {
  if (!phone || phone === 'none') return true;
  return /^[\d\s\-\+\(/)]+$/.test(phone) && phone.length > 7 && phone.length < 20;
};

const validateTimezone = (tz) => {
  if (!tz) return true;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const timezoneMiddleware = (req, res, next) => {
  const timezone = req.headers['x-timezone'];
  if (timezone && !validateTimezone(timezone)) {
    return res.status(400).json({ error: 'Invalid timezone' });
  }
  next();
};

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const apiKeyMiddleware = (req, res, next) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token'});
  }
};

app.get('/auth/challenge', async (req, res) => {
  try {
    const challenge = await createChallenge({
      hmacKey: ALTCHA_HMAC_KEY,
      maxNumber: 100000,
      saltLength: 12,
      algorithm: 'SHA-256',
      expires: new Date(Date.now() + 5 * 60 * 1000)
    });
    
    res.json({
      challenge: challenge.challenge,
      salt: challenge.salt,
      algorithm: challenge.algorithm,
      signature: challenge.signature
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create challenge', details: error.message });
  }
});

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, altchaPayload } = req.body;
    
    if (!altchaPayload) {
      return res.status(400).json({ error: 'Captcha required' });
    }
    
    const verified = await verifySolution(altchaPayload, ALTCHA_HMAC_KEY);
    if (!verified) {
      return res.status(400).json({ error: 'Invalid captcha. Please try again!' });
    }
    
    if (!email || !password || !validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        gym: {
          create: {
            name: 'none',
            owner: 'none',
            description: 'none',
            address: 'none',
            timezone: 'UTC'
          }
        }
      }
    });
    
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password, altchaPayload } = req.body;
    
    if (!altchaPayload) {
      return res.status(400).json({ error: 'Captcha required' });
    }
    
    const verified = await verifySolution(altchaPayload, ALTCHA_HMAC_KEY);
    if (!verified) {
      return res.status(400).json({ error: 'Invalid captcha. Please try again.' });
    }
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  
    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

app.post('/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current and new password are required'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        error: 'New password must be at least 6 characters'
      });
    }
    
    if (newPassword.length > 100) {
      return res.status(400).json({
        error: 'Password must be under 100 character'
      });
    }
    
    if (currentPassword === newPassword) {
      return res.status(400).json({
        error: 'New password must be different'
      });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password
    );
      
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Current password is incorrect'
      });
    }
      
    const hashedPassword = await bcrypt.hash(newPassword, 10);
      
    await prisma.user.update({
      where: { id: req.userId },
      data: { password: hashedPassword }
    });
      
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to change password',
      details: error.message
    });
  }
});

app.get('/gym', authMiddleware, async (req, res) => {
  try {
    const gym = await prisma.gym.findUnique({ where: { userId: req.userId } });
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    res.json({
      id: gym.id,
      name: gym.name,
      owner: gym.owner,
      description: gym.description,
      address: gym.address,
      timezone: gym.timezone
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gym', details: error.message });
  }
});

app.put('/gym', authMiddleware, async (req, res) => {
  try {
    const { name, owner, description, address, timezone } = req.body;
    
    await prisma.gym.update({
      where: { userId: req.userId },
      data: {
        name: sanitize(name) || 'none',
        owner: sanitize(owner) || 'none',
        description: sanitize(description, 500) || 'none',
        address: sanitize(address, 300) || 'none',
        timezone: sanitize(timezone, 50) || 'UTC'
      }
    });
    
    res.json({ success: true, message: 'Gym updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update gym', details: error.message });
  }
});

app.get('/members', authMiddleware, timezoneMiddleware, async (req, res) => {
  try {
    const gym = await prisma.gym.findUnique({
      where: { userId: req.userId }
    });
    if (!gym) return res.status(404).json({ error: 'Gym not found' });

    const timezone = req.headers['x-timezone'] || gym.timezone || 'UTC';
    const now = new Date();
    const todayStr = new Date(
      now.toLocaleString('en-US', { timeZone: timezone })
    ).toISOString().split('T')[0];

    const members = await prisma.member.findMany({
      where: { gymId: gym.id },
      include: {
        attendance: {
          where: { date: new Date(todayStr) }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    let active = 0, expired = 0, expiresSoon = 0;

    const membersList = members.map(m => {
      let status = 'active';
      let daysLeft = null;

      if (m.plan !== 'lifetime' && m.expiryDate) {
        const daysRemaining = Math.ceil(
          (new Date(m.expiryDate) - now) / (1000 * 60 * 60 * 24)
        );
        daysLeft = daysRemaining;

        if (daysRemaining < 0) {
          status = 'expired';
          expired++;
        } else if (daysRemaining <= 14) {
          status = 'expiresSoon';
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
          note: m.note
        }
      };
    });

    res.json({
      membersCount: {
        all: members.length,
        active,
        expiresSoon,
        expired
      },
      membersList: membersList
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch members',
      details: error.message
    });
  }
});

app.post('/members', authMiddleware, async (req, res) => {
  try {
    const { fullname, email, phone, birthday, note, plans } = req.body;
    
    const gym = await prisma.gym.findUnique({ where: { userId: req.userId } });
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    
    const count = await prisma.member.count({ where: { gymId: gym.id } });
    if (count >= 100) {
      return res.status(400).json({ error: 'Member limit reached (100 members max)' });
    }
    
    if (!fullname || !plans || !['monthly', 'yearly', 'lifetime'].includes(plans)) {
      return res.status(400).json({ error: 'Invalid data' });
    }
    
    if (email && email === 'none' && !validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (phone && phone === 'none' && !validatePhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone format' });
    }
    
    let expiryDate = null;
    if (plans === 'monthly') {
      expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else if (plans === 'yearly') {
      expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }
    
    let birthdayISO = 'none';
    if (birthday && birthday !== 'none') {
      try {
        const date = new Date(birthday);
        if (!isNaN(date.getTime())) {
          birthdayISO = date.toISOString().split('T')[0];
        }
      } catch(error) {
        birthdayISO = 'none';
      }
    }
    
    const member = await prisma.member.create({
      data: {
        gymId: gym.id,
        name: sanitize(fullname),
        email: email && email !== 'none' ? sanitize(email) : 'none',
        phone: phone && phone !== 'none' ? sanitize(phone, 20) : 'none',
        birthday: birthdayISO,
        note: note && note !== 'none' ? sanitize(note, 500) : 'none',
        plan: plans,
        expiryDate
      }
    });
    
    res.json({ success: true, memberId: member.id });
  } catch(error) {
    res.status(500).json({ error: 'Failed to create member', details: error.message });
  }
});

app.put('/members/:id', authMiddleware, async (req, res) => {
  try {
    const memberId = req.params.id;
    const { fullname, email, phone, birthday, note } = req.body;
    
    const gym = await prisma.gym.findUnique({ where: { userId: req.userId } });
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    
    if (!fullname || fullname.trim() === '') {
      return res.status(400).json({ error: 'Full name is required' });
    }
    
    if (email && email === 'none' && !validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (phone && phone === 'none' && !validatePhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone format' });
    }
    
    let birthdayISO = 'none';
    if (birthday && birthday !== 'none') {
      try {
        const date = new Date(birthday);
        if (!isNaN(date.getTime())) {
          birthdayISO = date.toISOString().split('T')[0];
        }
      } catch(error) {
        birthdayISO = 'none';
      }
    }
    
    await prisma.member.updateMany({
      where: { id: memberId, gymId: gym.id },
      data: {
        name: sanitize(fullname) || 'none',
        email: email && email !== 'none' ? sanitize(email) : 'none',
        phone: phone && phone !== 'none' ? sanitize(phone, 20) : 'none',
        birthday: birthdayISO,
        note: note && note !== 'none' ? sanitize(note, 500) : 'none'
      }
    });
    
    res.json({ success: true, message: 'Member updated' });
  } catch(error) {
    res.status(500).json({ error: 'Failed to update member', details: error.message });
  }
});

app.post('/members/:id/renew', authMiddleware, async (req, res) => {
  try {
    const memberId = req.params.id;
    const { plan } = req.body;
    
    if (!['monthly', 'yearly', 'lifetime'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    const gym = await prisma.gym.findUnique({ where: { userId: req.userId } });
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    
    const member = await prisma.member.findFirst({
      where: { id: memberId, gymId: gym.id }
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    
    let expiryDate = null;
    const now = Date.now();
    const currentExpiry = member.expiryDate ? new Date(member.expiryDate).getTime() : now;
    const baseDate = currentExpiry > now ? currentExpiry : now;
    
    if (plan === 'monthly') {
      expiryDate = new Date(baseDate + 30 * 24 * 60 * 60 * 1000);
    } else if (plan === 'yearly') {
      expiryDate = new Date(baseDate + 365 * 24 * 60 * 60 * 1000);
    }
    
    await prisma.member.update({
      where: { id: memberId },
      data: { plan, expiryDate }
    });
    
    res.json({ success: true, message: 'Membership renewed' });
  } catch(error) {
    res.status(500).json({ error: 'Failed to renew membership', details: error.message });
  }
});

app.delete('/members/:id', authMiddleware, async (req, res) => {
  try {
    const memberId = req.params.id;
    
    const gym = await prisma.gym.findUnique({
      where: { userId: req.userId }
    });
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    
    const member = await prisma.member.findFirst({
      where: { id: memberId, gymId: gym.id }
    });
    
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found'});
    }
    await prisma.member.delete({
      where: { id: memberId }
    });
    
    res.json({ success: true, message: 'Member deleted' });
  } catch(error) {
    res.status(500).json({ error: 'Failed to delete member', details: error.message });
  }
});

app.post('/members/:id/attendance', authMiddleware, timezoneMiddleware, async (req, res) => {
  try {
    const memberId = req.params.id;
    
    const gym = await prisma.gym.findUnique({
      where: { userId: req.userId }
    });
    
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    
    const member = await prisma.member.findFirst({
      where: { id: memberId, gymId: gym.id }
    });
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const timezone = req.headers['x-timezone'] || gym.timezone || 'UTC';
    const now = new Date();
    const todayStr = new Date(now.toLocaleString('en-US', { timeZone: timezone })).toISOString().split('T')[0];
    const todayDate = new Date(todayStr);
    
    const existing = await prisma.attendance.findFirst({
      where: {
        memberId,
        date: todayDate
      }
    });
    
    if (existing) {
      await prisma.attendance.delete({ where: { id: existing.id } });
      res.json({ success: true, action: 'removed', isAttended: false });
    } else {
      try {
        await prisma.attendance.create({
          data: {
            gymId: gym.id,
            memberId,
            date: todayDate
          }
        });
        res.json({ success: true, action: 'added', isAttended: true });
      } catch (createError) {
        if (createError.code === 'P2002') {
          res.json({
            success: true,
            action: 'already_exists',
            isAttended: true
          });
        } else {
          throw createError;
        }
      }
    }
  } catch(error) {
    res.status(500).json({ error: 'Failed to toggle attendance', details: error.message });
  }
});

app.get('/storage/journals', authMiddleware, async (req, res) => {
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

app.put('/storage/journals', authMiddleware, async (req, res) => {
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

app.delete('/storage/journals', authMiddleware, async (req, res) => {
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

app.get('/storage/attendance', authMiddleware, async (req, res) => {
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

app.put('/storage/attendance', authMiddleware, async (req, res) => {
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
    
    await prisma.gym.update({
      where: { userId: req.userId },
      data: {
        attendanceHistory: JSON.stringify(attendance)
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

app.delete('/storage/attendance', authMiddleware, async (req, res) => {
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

app.get('/api/', (req, res) => {
  
});

app.get('/api/v1/gym', apiKeyMiddleware, async (req, res) => {
  try {
    const gym = await prisma.gym.findUnique({
      where: {
        userId: req.userId,
      },
    });
    
    if (!gym) {
      return res.status(404).json({ error: 'Gym not found' })
    }
    
    res.json({
      success: true,
      id: gym.id,
      name: gym.name,
      owner: gym.owner,
      description: gym.description,
      address: gym.address,
      timezone: gym.timezone
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch gym data',
      details: error.message
    });
  }
});

app.get('/api/v1/members', apiKeyMiddleware, async (req, res) => {
  try {
    const gym = await prisma.gym.findUnique({
      where: { userId: req.userId }
    });
    
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    
    const timezone = gym.timezone || 'UTC';
    const now = new Date();
    const todayStr = new Date(
      now.toLocaleString('en-US', { timeZone: timezone })
    ).toISOString().split('T')[0];
    
    const members = await prisma.member.findMany({
      where: { gymId: gym.id },
      include: {
        attendance: {
          where: { date: new Date(todayStr) }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    let active = 0,
        expired = 0,
        expiresSoon = 0;
        
    const membersList = members.map(m => {
      let status = 'active';
      let daysLeft = null;
      
      if (m.plan !== 'lifetime' && m.expiryDate) {
        const daysRemaining = Math.ceil(
          (new Date(m.expiryDate) - now) / (1000 * 60 * 60 * 24)
        );
        daysLeft = daysRemaining;
        
        if (daysRemaining < 0) {
          status = 'expired';
          expired++;
        } else if (daysRemaining <= 14) {
          status = 'expiresSoon';
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
          note: m.note
        }
      };
    });
    
    res.json({
      success: true,
      membersCount: {
        all: members.length,
        active,
        expiresSoon,
        expired
      },
      membersList
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch members data',
      details: error.message
    });
  }
});

app.get('api/v1/attendance', apiKeyMiddleware, async (req, res) => {
  try {
    const gym = prisma.gym.findUnique({
      where: { userId: req.userId }
    });
    
    if (!gym) {
      return res.status(404).json({ error: 'Gym not found' })
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
    
    const attendance = gym.attendanceHistory ? JSON.parse(gym.attendanceHistory) : defaultAttendance;
    
    res.json({
      success: true,
      attendance
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch attendance data',
      details: error.message
    });
  }
});

app.get('/stats', async (req, res) => {
  try {
    const now = Date.now();
    
    if (statsCache && statsCacheTime && (now - statsCacheTime) < CACHE_DURATION) {
      return res.json({
        ...statsCache,
        cache: {
          cached: true,
          cacheAge: Math.floor((now - statsCacheTime) / 1000)
        }
      });
    }
    
    const totalAccounts = await prisma.user.count();
    const totalMembers = await prisma.member.count();
    
    const stats = {
      totalAccounts,
      totalMembers,
      timestamp: new Date().toISOString()
    };
    
    statsCache = stats;
    statsCacheTime = now;
    
    res.json({
      ...stats,
      cache: {
        cached: false,
        cacheAge: null
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch stats',
      details: error.message
    });
  }
});

app.get('/', (req, res) => {
  try {
    const uptime = process.uptime();
    
    res.json({
      success: true,
      name: 'Gymscribe API',
      status: 'online',
      version: 'v1',
      routes: [
        '/stats',
        '/api?token=YOURTOKEN'
      ],
      system: {
        uptime: `${Math.floor(uptime)}s`,
        node: process.version,
        platform: os.platform(),
        cpu: os.cpus().length,
        memory: {
          used: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
          total: Math.round(os.totalmem() / 1024 / 1024) + 'MB'
        }
      }
    });
  } catch (error) {
    res.json({
      success: true,
      name: 'Gymscribe API',
      status: 'online',
      version: 'v1',
      routes: [
        '/stats',
        '/api?token=YOURTOKEN'
      ],
      system: 'Failed to fetch system info'
    });
  }
});

const server = app.listen(PORT, () => {
  console.log('Listening on port ' + PORT);
});

process.on("unhandledRejection", (error) => {
  console.log(`Unhandled Rejection: ${error}`);
  server.close(async () => {
    process.exit(1);
  });
});

process.on("uncaughtException", async (error) => {
  console.log(`Uncaught Exception: ${error}`);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM, Shutting Down");
  server.close(async () => {
    process.exit(0);
  });
});