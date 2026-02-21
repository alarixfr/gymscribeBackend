import express from 'express';
import os from 'os';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import { prisma } from './lib/prisma.js';
import { rateLimit } from './middleware/rateLimit.js';
import routes from './routes/index.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.log('ENV: JWT SECRET MISSING');
  process.exit(1);
}

if (!process.env.ALTCHA_SECRET) {
  console.log('ENV: ALTCHA SECRET MISSING');
  process.exit(1);
}

const app = express();
const PORT = 8080;
const serverVersion = 'v1';

app.use(helmet());
app.use(compression());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${Date.now() - start}ms`);
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-timezone');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

app.use((req, res, next) => {
  const contextLength = parseInt(req.headers['content-length'] || '0');
  
  if (contextLength > 1 * 1024 * 1024) {
    console.warn(`Large request detected from ${req.ip} - ${contextLength} bytes on ${req.method} ${req.path}`);
  }
  next();
});

const BLOCKED_IPS = new Set([]);

app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress;
  
  if (BLOCKED_IPS.has(ip)) {
    return res.status(403).json({
      error: 'Forbidden'
    });
  }
  
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowsMs: 60 * 1000, max: 100}));
app.set('etag', true);
app.use(routes);

app.get('/', (req, res) => {
  try {
    const start = Date.now();
    const uptime = process.uptime();
    const ip = req.socket.localAddress || req.ip;
    
    res.json({
      success: true,
      status: 'online',
      name: 'Gymscribe API',
      version: `${serverVersion}`,
      routes: [
        '/stats',
        '/api'
      ],
      system: {
        ip: `${ip}`,
        ping: `${Date.now() - start}ms`,
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
    res.status(500).json({
      success: true,
      status: 'online',
      name: 'Gymscribe API',
      version: 'v1',
      routes: [
        '/stats',
        '/api'
      ],
      system: 'Failed to fetch system info'
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  console.error(`Unhandled error on ${req.method} ${req.path}: ${err}`);
  
  res.status(500).json({ error: `Internal server error`, details: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`
  Gymscribe API ${serverVersion}
  Node        : ${process.version}
  Platform    : ${os.platform()}
  PORT        : ${PORT}
  `);
});

const shutdown = async (signal) => {
  console.log(`${signal} - SHUTTING DOWN`);
  
  const forceKill = setTimeout(() => {
    console.error('FORCE KILL IN 10S TIMEOUT');
    process.exit(1);
  }, 10000);
  
  server.close(async () => {
    await prisma.$disconnect();
    clearTimeout(forceKill);
    process.exit(0);
  });
};

process.on("unhandledRejection", async (error) => {
  console.log(`Unhandled Rejection: ${error}`);
  await prisma.$disconnect();
  server.close(() => process.exit(1));
});

process.on("uncaughtException", async (error) => {
  console.log(`Uncaught Exception: ${error}`);
  await prisma.$disconnect();
  process.exit(1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));