import express from 'express';
import { config } from 'dotenv';
import { connectDB, disconnectDB } from './config/db.js';
const PORT = 8080;

config();
connectDB();

import serverRoutes from './routes/serverRoutes.js';

const app = express();

app.use('/server', serverRoutes);

app.get('/', (req, res) => {
  res.json({message: `listening on port ${PORT}`});
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