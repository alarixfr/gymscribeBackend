import { Router } from 'express';
import { Prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { sanitize } from '../utils/sanitize.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
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

router.put('/', authMiddleware, async (req, res) => {
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

export default router;