import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { timezoneMiddleware } from '../middleware/timezone.js';
import { sanitize } from '../utils/sanitize.js';
import { validateEmail, validatePhone } from '../utils/validate.js';

const router = Router();

router.get('/', authMiddleware, timezoneMiddleware, async (req, res) => {
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

router.post('/', authMiddleware, async (req, res) => {
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
    
    if (email && email !== 'none' && !validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (phone && phone !== 'none' && !validatePhone(phone)) {
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

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const memberId = req.params.id;
    const { fullname, email, phone, birthday, note } = req.body;
    
    const gym = await prisma.gym.findUnique({ where: { userId: req.userId } });
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    
    if (!fullname || fullname.trim() === '') {
      return res.status(400).json({ error: 'Full name is required' });
    }
    
    if (email && email !== 'none' && !validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (phone && phone !== 'none' && !validatePhone(phone)) {
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

router.post('/:id/renew', authMiddleware, async (req, res) => {
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

router.delete('/:id', authMiddleware, async (req, res) => {
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

router.post('/:id/attendance', authMiddleware, timezoneMiddleware, async (req, res) => {
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

export default router;