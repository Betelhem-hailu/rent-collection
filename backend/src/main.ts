import 'dotenv/config';
import express from 'express';
import routes from './routes/index.js';
import { connectDatabase, prisma } from './shared/database/prisma.service.js';
import { errorResponse } from './shared/http.js';

const app = express();
app.use(express.json({ limit: '100kb', verify(req, _res, body) { (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(body); } }));
app.use(routes);
app.use(errorResponse);

// Establish the database connection before accepting HTTP requests.
try {
  await connectDatabase();
} catch (error) {
  console.error('Database connection failed:', error);
  await prisma.close();
  process.exit(1);
}

// 1. Capture the running server instance to close it cleanly
const server = app.listen(Number(process.env.PORT || 3001), () => {
  console.log(`Server is running on port ${process.env.PORT || 3001}`);
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
