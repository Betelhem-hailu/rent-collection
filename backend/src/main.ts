import express from 'express';
import routes from './routes/index.js';
import { prisma } from './shared/database/prisma.service.js';
import { config } from "dotenv";

config();
const app = express();
app.use(express.json());
app.use(routes);

// 1. Capture the running server instance to close it cleanly
const server = app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

// 2. Uniform Graceful Shutdown Function
async function gracefulShutdown(signal: any) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      // In Prisma 8, use .close() instead of $disconnect()
      await prisma.close(); 
      console.log('Database connection pool drained.');
      process.exit(0);
    } catch (err) {
      console.error('Error during database disconnection:', err);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
