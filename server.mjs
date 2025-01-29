import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer(handle); // This will serve your Next.js app

    const io = new Server(httpServer); // Socket.io is attached to the same server

    io.on("connection", (socket) => {
        console.log(`a user connected: ${socket.id}`);

        socket.on("join-room", ({ room, username }) => {
            socket.join(room);
            console.log(`User ${username} joined room: ${room}`);
            socket.to(room).emit("user_joined", `${username} joined the room`);
        });

        socket.on("message", ({ room, message, sender }) => {
            console.log(`message from ${sender}: in room ${room}: ${message}`);
            socket.to(room).emit("message", { sender, message });
        });

        // Listen for when a user disconnects
        socket.on("disconnect", () => {
            console.log(`a user disconnected: ${socket.id}`);
        });
    });

    // Start the server to listen on the specified port
    httpServer.listen(port, () => {
        console.log(`Server running on http://${hostname}:${port}`);
    });
});
