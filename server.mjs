
import Redis from 'ioredis';
import socketIoRedis from 'socket.io-redis';

import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT || '3005';

// Log environment variables to ensure they're set correctly
console.log('Environment:', process.env.NODE_ENV);
console.log('HOSTNAME:', hostname);
console.log('PORT:', port);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    console.log('Next.js app prepared successfully.');

    const httpServer = createServer(handle); // This will serve your Next.js app
    const io = socketIo(server, {
        cors: {
        origin: "*",  // This allows all origins, or you can specify the frontend URL
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true,
  },
});

   // const io = new Server(httpServer); // Socket.io is attached to the same server

    io.on("connection", (socket) => {
        console.log(`${socket.id} has connected`);

        socket.on("join-room", ({ room, username }) => {
            console.log(`User ${username} joined room: ${room}`);
            socket.join(room);
            socket.to(room).emit("user_joined", `${username} joined the room`);
        });

        socket.on("message", ({ room, message, sender }) => {
            console.log(`Message from ${sender} in room ${room}: ${message}`);
            socket.to(room).emit("message", { sender, message });
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });

    // Log when the server starts listening
    httpServer.listen(port, '0.0.0.0', () => {
        console.log(`Server is listening on http://${hostname}:${port}`);
    });
}).catch((err) => {
    // Log any errors during app preparation
    console.error('Error preparing Next.js app:', err);
});

