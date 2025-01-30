import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import fs from 'fs';  // Import the filesystem module

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT || '3005';

// Log environment variables to ensure they're set correctly
console.log('Environment:', process.env.NODE_ENV);
console.log('HOSTNAME:', hostname);
console.log('PORT:', port);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Helper function to read rooms from a file
const getRoomsFromFile = () => {
    try {
        const data = fs.readFileSync('rooms.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return []; // Return an empty array if file doesn't exist
    }
};

// Helper function to save rooms to a file
const saveRoomsToFile = (rooms) => {
    fs.writeFileSync('rooms.json', JSON.stringify(rooms), 'utf8');
};

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

        // Fetch available rooms from the file
        const rooms = getRoomsFromFile();
        
        // Send available rooms to the client
        socket.emit("availableRooms", rooms);

        socket.on("join-room", ({ room, username }) => {
            console.log(`User ${username} joined room: ${room}`);
            socket.join(room);
            socket.to(room).emit("user_joined", `${username} joined the room`);
        });

        socket.on("createRoom", (newRoom) => {
            const rooms = getRoomsFromFile();
            rooms.push(newRoom);
            saveRoomsToFile(rooms);  // Save to file
            io.emit("availableRooms", rooms);  // Broadcast updated rooms list
        });

        socket.on("removeRoom", (roomToRemove) => {
            let rooms = getRoomsFromFile();
            rooms = rooms.filter((room) => room !== roomToRemove);
            saveRoomsToFile(rooms);  // Save updated rooms to file
            io.emit("availableRooms", rooms);  // Broadcast updated rooms list
        });

        socket.on("message", ({ room, message, sender }) => {
            console.log(`Message from ${sender} in room ${room}: ${message}`);
            socket.to(room).emit("message", { sender, message });
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });

    httpServer.listen(port, '0.0.0.0', () => {
        console.log(`Server is listening on http://${hostname}:${port}`);
    });
}).catch((err) => {
    console.error('Error preparing Next.js app:', err);
});
