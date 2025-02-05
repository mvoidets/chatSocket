import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import pkg from 'pg';
const { Client } = pkg;

// Database client initialization
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT || '3005';

client.connect().then(() => {
    console.log('Connected to PostgreSQL database');
}).catch((error) => {
    console.error('Failed to connect to PostgreSQL:', error);
});

// Helper functions
const getRoomsFromDB = async () => {
    try {
        const res = await client.query('SELECT name FROM rooms');
        return res.rows.map(row => row.name);
    } catch (error) {
        console.error('Error fetching rooms from DB:', error);
        return [];
    }
};

const saveMessageToDatabase = async (room, message, sender) => {
    try {
        const res = await client.query('INSERT INTO messages (room_name, message, sender) VALUES ($1, $2, $3) RETURNING *', [room, message, sender]);
        console.log('Message saved to DB:', res.rows[0]);
    } catch (error) {
        console.error('Error saving message to DB:', error);
    }
};

const createOrGetGame = async (room) => {
    try {
        const roomRes = await client.query('SELECT * FROM rooms WHERE name = $1', [room]);

        if (roomRes.rows.length === 0) {
            await client.query('INSERT INTO rooms (name) VALUES ($1)', [room]);
        }

        const gameRes = await client.query('SELECT * FROM games WHERE room_name = $1', [room]);

        if (gameRes.rows.length > 0) {
            return gameRes.rows[0]; // Game exists, return it
        }

        // No game found, create a new one
        const newGameRes = await client.query('INSERT INTO games (room_name, current_turn) VALUES ($1, 1) RETURNING *', [room]);
        return newGameRes.rows[0];
    } catch (error) {
        console.error('Error creating or fetching game:', error);
        return null;
    }
};

const addPlayerToGame = async (gameId, playerName, chips) => {
    try {
        const playerRes = await client.query('INSERT INTO players (game_id, playername, chips, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *', [gameId, playerName, chips]);
        console.log(`${playerName} added to the game.`);
        return playerRes.rows[0];
    } catch (error) {
        console.error('Error adding player:', error);
        return null;
    }
};

// Main server initialization
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
    });

    io.on('connection', (socket) => {
        console.log('New socket connection');

        // Handle fetching available rooms
        socket.on('get-available-rooms', async () => {
            try {
                const rooms = await getRoomsFromDB();
                io.emit('availableRooms', rooms);
            } catch (error) {
                console.error('Error fetching rooms:', error);
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

                await client.query('INSERT INTO rooms (name) VALUES ($1)', [newRoom]);
                console.log(`Room created: ${newRoom}`);
                io.emit('availableRooms', await getRoomsFromDB());
            } catch (error) {
                console.error('Error creating room:', error);
            }
        });

        // Handle joining room
        socket.on('join-room', async ({ room, userName }) => {
            console.log(`User ${userName} joining room: ${room}`);
            socket.join(room);

            try {
                const game = await createOrGetGame(room);
                if (!game) return;

                // Check if player exists, if not, add them
                const checkPlayer = await client.query('SELECT * FROM players WHERE game_id = $1 AND playername = $2', [game.id, userName]);
                if (checkPlayer.rows.length === 0) {
                    await addPlayerToGame(game.id, userName, 3); // Adding player with 3 chips
                }

                // Emit message history
                const messages = await getMessagesFromDB(room);
                socket.emit('messageHistory', messages);

                // Broadcast to room that user joined
                io.to(room).emit('user_joined', `${userName} joined the room`);
            } catch (error) {
                console.error('Error joining room:', error);
            }
        });

        // Handle message event
        socket.on('message', async ({ room, message, sender }) => {
            console.log(`Message from ${sender}: ${message}`);
            await saveMessageToDatabase(room, message, sender);
            io.to(room).emit('message', { sender, message });
        });

        // Handle player turn
        socket.on('playerTurn', async (data) => {
            const { room, playerId, rollResults } = data;

            try {
                // Game and player logic goes here (update game state and chips)
                const updatedGameState = await updateGameState(room, playerId, rollResults);
                io.to(room).emit('gameStateUpdated', updatedGameState);

                // Update turn and broadcast next player
                await updatePlayerTurn(room, playerId);
                const nextPlayer = getNextPlayer(updatedGameState, playerId);
                io.to(room).emit('current-turn', `It's now ${nextPlayer.name}'s turn!`);
            } catch (error) {
                console.error('Error processing player turn:', error);
            }
        });
    });

    httpServer.listen(port, '0.0.0.0', () => {
        console.log(`Server listening on http://${hostname}:${port}`);
    });
}).catch((err) => {
    console.error('Error preparing Next.js app:', err);
});
