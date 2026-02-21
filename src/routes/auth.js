import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createChallenge, verifySolution } from 'altcha-lib';
import { Prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateEmail } from '../utils/validate.js';

const ALTCHA_HMAC_KEY = process.env.ALTCHA_SECRET;

const router = Router();

router.get('/challenge', async (req, res) => {
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

router.post('/register', async (req, res) => {
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

router.post('/login', async (req, res) => {
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

router.post('/change-password', authMiddleware, async (req, res) => {
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
        error: 'Password must be under 100 characters'
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

export default router;