import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import pkg from 'pg';
const { Client } = pkg;


// Initialize Next.js app and socket.io server
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT || '3005';

const client = new Client({
    connectionString: process.env.DATABASE_URL, // Ensure this is correct
});

client.connect().then(() => {
    console.log('Connected to PostgreSQL database');
}).catch((error) => {
    console.error('Failed to connect to PostgreSQL:', error);
});


const getRoomsFromDB = async () => {
    try {
        const res = await client.query('SELECT name FROM rooms');
        console.log('Rooms fetched from DB:', res.rows); // Log rooms to see if we have any
        return res.rows.map(row => row.name); // Return room names
    } catch (error) {
        console.error('Error fetching rooms from DB:', error);
        return [];
    }
};

const createRoomInDB = async (newRoom) => {
    try {
        // Check if the room already exists in the DB
        const checkRes = await client.query('SELECT * FROM rooms WHERE name = $1', [newRoom]);
        if (checkRes.rows.length > 0) {
            console.log('Room already exists');
            return null;  // Room already exists, prevent creation
        }

        // Insert the new room into the database
        const res = await client.query(
            'INSERT INTO rooms (name) VALUES ($1) RETURNING *',
            [newRoom]
        );
        console.log('Created room:', res.rows[0]);
        return res.rows[0]; // Return the created room
    } catch (error) {
        console.error('Error creating room in DB:', error);
        return null;
    }
};


const removeRoomFromDB = async (roomToRemove) => {
    try {
        await client.query('DELETE FROM rooms WHERE name = $1', [roomToRemove]);
        console.log(`Room ${roomToRemove} removed from DB`);
    } catch (error) {
        console.error('Error removing room from DB:', error);
    }
};

const getMessagesFromDB = async (room) => {
    try {
        const res = await client.query(
            'SELECT sender, message, timestamp FROM messages WHERE room_id = (SELECT id FROM rooms WHERE name = $1) ORDER BY timestamp ASC',
            [room]
        );
        return res.rows; // Return the list of messages
    } catch (error) {
        console.error('Error fetching messages from DB:', error);
        return [];
    }
};

const saveMessageToDB = async (room, sender, message) => {
    try {
        await client.query(
            'INSERT INTO messages (room_id, sender, message) VALUES ((SELECT id FROM rooms WHERE name = $1), $2, $3)',
            [room, sender, message]
        );
    } catch (error) {
        console.error('Error saving message to DB:', error);
    }
};

// Log environment variables to ensure they're set correctly
console.log('Environment:', process.env.NODE_ENV);
console.log('HOSTNAME:', hostname);
console.log('PORT:', port);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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

        // Fetch available rooms from the database
        socket.on("get-available-rooms", async () => {
            const rooms = await getRoomsFromDB(); // Fetch rooms from the database
            socket.emit("availableRooms", rooms);
        });

        // Handle room creation
        socket.on("createRoom", async (newRoom) => {
            const room = await createRoomInDB(newRoom);
            if (room) {
                console.log(`Room ${newRoom} created`);
                io.emit("availableRooms", await getRoomsFromDB()); // Emit updated room list after creation
            } else {
                console.log('Failed to create room');
            }
        });
    
        // Handle room removal
        socket.on("removeRoom", async (roomToRemove) => {
            await removeRoomFromDB(roomToRemove);
            io.emit("availableRooms", await getRoomsFromDB()); // Emit updated room list
        });

        // Handle joining a room
        socket.on("join-room", async ({ room, username }) => {
            console.log(`User ${username} joined room: ${room}`);
            socket.join(room);

            // Fetch the message history for the room
            const messages = await getMessagesFromDB(room);
            socket.emit("messageHistory", messages); // Send message history to the user

            socket.to(room).emit("user_joined", `${username} joined the room`);
        });

        // Handle sending a message
        socket.on("message", async ({ room, message, sender }) => {
            console.log(`Message from ${sender} in room ${room}: ${message}`);
            await saveMessageToDB(room, sender, message); // Save message to database
            socket.to(room).emit("message", { sender, message });
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });

    httpServer.listen(port, '0.0.0.0', () => {
        console.log(`Server is listening on http://localhost:${port}`);
    });
}).catch((err) => {
    console.error('Error preparing Next.js app:', err);
});
