import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import socketIoRedis from 'socket.io-redis';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT || 3000;

// Set up Redis connection (use Redis URL from Render)
const redis = new Redis(process.env.REDIS_URL);

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handle); // Create HTTP server to serve Next.js app

  const io = new Server(httpServer); // Attach Socket.IO to the same server
  // Use socket.io-redis for pub/sub with Redis
  io.adapter(socketIoRedis({ pubClient: redis, subClient: redis }));

  io.on('connection', (socket) => {
    console.log(`a user connected: ${socket.id}`);

    socket.on('join-room', ({ room, username }) => {
      socket.join(room);
      console.log(`User ${username} joined room: ${room}`);
      socket.to(room).emit('user_joined', `${username} joined the room`);
    });

    socket.on('message', ({ room, message, sender }) => {
      console.log(`message from ${sender}: in room ${room}: ${message}`);
      socket.to(room).emit('message', { sender, message });
    });

    // Handle user disconnections
    socket.on('disconnect', () => {
      console.log(`a user disconnected: ${socket.id}`);
    });
  });

  // Start the server on the dynamic port
  httpServer.listen(port, () => {
    console.log(`Server running on http://${hostname}:${port}`);
  });
});
