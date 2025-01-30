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

const rooms = []; // In-memory list of rooms (could be an array or object)

// Set up the Next.js app
app.prepare().then(() => {
    console.log('Next.js app prepared successfully.');

    const httpServer = createServer(handle); // This will serve your Next.js app
    const io = new Server(httpServer, {
        cors: {
            origin: "*",  // This allows all origins, or you can specify the frontend URL
            methods: ["GET", "POST"],
            allowedHeaders: ["Content-Type"],
            credentials: true,
        },
    });

    io.on("connection", (socket) => {
        console.log(`${socket.id} has connected`);

        // Send the list of available rooms when a client requests it
        socket.on("getAvailableRooms", () => {
            socket.emit("availableRooms", rooms); // Emit available rooms
        });

        // Create a new room
        socket.on("createRoom", (roomName) => {
            if (rooms.includes(roomName)) {
                // Emit roomExists event if room already exists
                socket.emit("roomExists", roomName);
            } else {
                rooms.push(roomName); // Add the room to the list
                console.log(`Room created: ${roomName}`);
                io.emit("availableRooms", rooms); // Broadcast updated room list to all clients
            }
        });

        // Handle users joining rooms
        socket.on("join-room", ({ room, username }) => {
            console.log(`User ${username} joined room: ${room}`);
            socket.join(room);
            socket.to(room).emit("user_joined", `${username} joined the room`);
        });

        // Handle sending messages in a room
        socket.on("message", ({ room, message, sender }) => {
            console.log(`Message from ${sender} in room ${room}: ${message}`);
            socket.to(room).emit("message", { sender, message });
        });
        //user leaving room
        socket.on("leave-room", (room) => {
            socket.leave(room);
            console.log(`User ${socket.id} left room: ${room}`);
            socket.to(room).emit("user_left", `${socket.id} left the room`);
        });

           // Handle removing a room
        socket.on("removeRoom", (roomToRemove) => {
            rooms = rooms.filter(room => room !== roomToRemove); // Remove room from list
            io.emit("availableRooms", rooms); // Broadcast updated rooms list
    });

        // Handle disconnection
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
