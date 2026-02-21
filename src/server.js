import express from 'express';
import os from 'os';
import dotenv from 'dotenv';
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

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-timezone');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowsMs: 60 * 1000, max: 100}));
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
      version: 'v1',
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
    res.json({
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
    await prisma.$disconnect();
    process.exit(0);
  });
});