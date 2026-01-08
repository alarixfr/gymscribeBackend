import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createChallenge, verifySolution } from 'altcha';
import { connectDB, disconnectDB } from './config/db.js';

import serverRoutes from './routes/serverRoutes.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = 8080;

const ALTCHA_HMAC_KEY = process.env.ALTCHA_SECRET;

app.use(cors({
  origin: ['https://gymscribe.vercel.app'],
  credentials: true
}));
app.use(express.json());

const sanitize = (str, maxLengtht = 100) => {
  if (!str || str === 'none') return 'none';
  return String(str).trim().slice(0, maxLength);
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

app.get('/auth/challenge', (req, res) => {
  try {
    const challenge = createChallenge({
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
    res.status(500).json({ error: 'Failed to create challenge', details: e.message });
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
    const timestamp = Date.now();
    
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        createdAt: timestamp,
        gym: {
          create: {
            name: 'none',
            owner: 'none',
            description: 'none',
            address: 'none',
            timezone: 'UTC',
            createdAt: timestamp
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
    res.status(500).json({ error: 'Login failed', details: e.message });
  }
});

app.listen(PORT, () => {
  console.log('Listening on port ' + PORT);
});

process.on("unhandledRejection", (error) => {
  console.log(`Unhandled Rejection: ${error}`);
  server.close(async () => {
    await disconnectDB();
    process.exit(1);
  });
});

process.on("uncaughtExeption", async (error) => {
  console.log(`Uncaught Exeption: ${error}`);
  await disconnectDB();
  process.exit(1);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM, Shutting Down");
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
});