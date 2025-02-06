import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import pkg from 'pg';
const { Client } = pkg;

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT || '3005';

// Database client initialization
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

client.connect().then(() => {
    console.log('Connected to PostgreSQL database');
}).catch((error) => {
    console.error('Failed to connect to PostgreSQL:', error);
});

client.query('SELECT NOW()')
    .then(() => {
        console.log('Database is responding to queries');
    })
    .catch((error) => {
        console.error('Error executing test query:', error.message);
    });

// Fetch available rooms from DB
const getRoomsFromDB = async () => {
    try {
        const res = await client.query('SELECT name FROM rooms');
        console.log('Rooms from DB:', res.rows.map(row => row.name));  // Log after the query
        return res.rows.map(row => row.name);
    } catch (error) {
        console.error('Error fetching rooms from DB:', error);
        return [];
    }
};

// Handle room creation
const createRoomInDB = async (newRoom) => {
    try {
        const checkRes = await client.query('SELECT * FROM rooms WHERE name = $1', [newRoom]);
        if (checkRes.rows.length > 0) return null;
        await client.query('INSERT INTO rooms (name) VALUES ($1) RETURNING *', [newRoom]);
        return newRoom;
    } catch (error) {
        console.error('Error creating room in DB:', error);
        return null;
    }
};

// Save message to the database
const saveMessageToDatabase = async (room, message, sender) => {
    try {
        const res = await client.query('INSERT INTO messages (room_name, message, sender) VALUES ($1, $2, $3) RETURNING *', [room, message, sender]);
        console.log('Message saved to DB:', res.rows[0]);
    } catch (error) {
        console.error('Error saving message to DB:', error);
    }
};

// Get message history
export async function getMessagesFromDB(roomName) {
    try {
        const res = await client.query(
            'SELECT sender, message, created_at FROM messages WHERE room_name = $1 ORDER BY created_at ASC',
            [roomName]
        );
        return res.rows;
    } catch (error) {
        console.error('Error fetching messages from DB:', error);
        return [];
    }
};

// Dice rolling logic
const rollDice = (chips) => {
    const rollResults = [];
    for (let i = 0; i < chips; i++) {
        rollResults.push(Math.floor(Math.random() * 6) + 1);
    }
    return rollResults;
};

// Process dice roll results and update player state
const processDiceResults = async (diceResults, playerId, roomId) => {
    try {
        const totalRoll = diceResults.reduce((sum, roll) => sum + roll, 0);
        const updatedPlayers = await updatePlayerChips(playerId, totalRoll, roomId);
        return updatedPlayers;
    } catch (error) {
        throw error;
    }
};

// Update player chips in the database
const updatePlayerChips = async (playerId, totalRoll, room) => {
    try {
        const { rows: players } = await client.query(
            'SELECT * FROM players WHERE room_id = $1',
            [room]
        );

        const updatedPlayers = players.map(player => {
            if (player.id === playerId) {
                player.chips -= totalRoll; // Adjust based on your game rules
            }
            return player;
        });

        // Update the database
        for (let player of updatedPlayers) {
            await client.query(
                'UPDATE players SET chips = $1 WHERE id = $2',
                [player.chips, player.id]
            );
        }

        return updatedPlayers;
    } catch (error) {
        console.error('Error updating player chips:', error);
        throw error;
    }
};

// Socket event handling
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer(handle);
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["Content-Type"],
            credentials: true,
        },
        pingInterval: 25000,  // Send ping every 25 seconds
        pingTimeout: 60000,   // Timeout if no pong response in 60 seconds
    });

    io.on('connection', (socket) => {
        console.log(`A player connected: ${socket.id}`);

        // Handle the 'join-room' event
        socket.on('join-room', async ({ room, userName }) => {
            console.log(`Received join-room event for user: ${userName}, room: ${room}`);  // Log for debugging

            // If userName is undefined, return early
            if (!userName) {
                console.error("Error: userName is undefined when joining room");
                return;
            }

            try {
                // Ensure the user joins the room
                console.log(`User ${userName} is attempting to join room: ${room}`);
                socket.join(room);
                console.log(`${userName} joined the room: ${room}`);

                console.log(`${userName} joined the room: ${room}`); // Log the database query for fetching message history
                console.log(`Fetching message history for room: ${room}`);
                const messages = await getMessagesFromDB(room);

                // Log when message history is received and sent
                console.log(`Message history fetched for room: ${room}, sending to client.`);
                socket.emit('messageHistory', messages);

                // Log broadcasting the user joined to the room
                console.log(`Broadcasting user joined message to room: ${room}`);
                io.to(room).emit('user_joined', `${userName} has joined the room: ${room}`);
            } catch (error) {
                console.error('Error in join-room handler:', error);
            }
        });

        // Handle room creation
        socket.on('createRoom', async (newRoom) => {
            try {
                const checkRes = await client.query('SELECT * FROM rooms WHERE name = $1', [newRoom]);

                if (checkRes.rows.length > 0) {
                    console.log('Room already exists');
                    return;
                }

                const res = await client.query('INSERT INTO rooms (name) VALUES ($1) RETURNING *', [newRoom]);
                console.log(`Room created: ${newRoom}`);

                // Emit the updated available rooms
                io.emit('availableRooms', await getRoomsFromDB());
            } catch (error) {
                console.error('Error creating room:', error);
            }
        });

        // Handle fetching available rooms
        socket.on('get-available-rooms', async () => {
            try {
                const rooms = await getRoomsFromDB();
                io.emit('availableRooms', rooms);
                console.log(`Available rooms: ${rooms}`);
            } catch (error) {
                console.error('Error fetching available rooms:', error);
            }
        });

        // Handle leave-room event
        socket.on('leave-room', (room, name) => {
            console.log(`User: ${name}, has left the room: ${room}`);
            socket.leave(room);
            socket.to(room).emit('user_left', `${socket.id} left the room`);
        });

        // Handle removeRoom event
        socket.on("removeRoom", async (roomToRemove) => {
            console.log(`Removing room: ${roomToRemove}`);

            try {
                // Delete messages from the database for the specified room
                await client.query('DELETE FROM messages WHERE room_name = $1', [roomToRemove]);

                // Delete the room from the database
                await client.query('DELETE FROM rooms WHERE name = $1', [roomToRemove]);

                // Emit updated room list to clients
                io.emit("availableRooms", await getRoomsFromDB()); // Emit updated room list
            } catch (error) {
                console.error("Error deleting room and messages:", error);
            }
        });

        // Handle message event (sending messages in rooms)
        socket.on('message', async ({ room, message, sender }) => {
            console.log(`Sending message to room: ${room}, Message: ${message}`);
            console.log(`Message received from ${sender} in room ${room}: ${message}`);
            if (!room || !message || !sender) {
                console.error("Missing information in message event.");
                return;
            }

            try {
                await saveMessageToDatabase(room, message, sender);
                io.to(room).emit('message', { sender, message });
            } catch (error) {
                console.error('Error saving message to DB:', error);
            }
        }); // <-- Closing brace here

    }); // <-- Closing brace here

    // Start the server
    httpServer.listen(port, '0.0.0.0', () => {
        console.log(`Server listening on http://${hostname}:${port}`);
    });
}).catch((err) => {
    console.error('Error preparing app:', err);
});
