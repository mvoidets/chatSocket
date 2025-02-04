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

// Fetch available rooms from DB
const getRoomsFromDB = async () => {
    try {
        const res = await client.query('SELECT name FROM rooms');
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
        const res = await client.query('INSERT INTO rooms (name) VALUES ($1) RETURNING *', [newRoom]);
        return res.rows[0];
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
        return res.rows; // Return messages ordered by creation time
    } catch (error) {
        console.error('Error fetching messages from DB:', error);
        return []; // Return empty array if there's an error
    }
}

// Game-related functions (processing player turns, checking for winners, etc.)
const createOrGetGame = async (room) => {
    try {
        const res = await client.query('SELECT * FROM games WHERE room_name = $1', [room]);
        if (res.rows.length > 0) return res.rows[0];
        const newGameRes = await client.query('INSERT INTO games (room_name, current_turn) VALUES ($1, 1) RETURNING *', [room]);
        return newGameRes.rows[0];
    } catch (error) {
        console.error('Error creating game:', error);
        return null;
    }
};

// Process player turns (game logic for L, R, C)
const processTurn = async (gameId, playerId, rollResults) => {
    const playersRes = await client.query('SELECT * FROM players WHERE game_id = $1', [gameId]);
    const players = playersRes.rows;
    const player = players.find(p => p.player_id === playerId);

    rollResults.forEach((roll) => {
        if (roll === 'L') {
            const leftPlayer = getLeftPlayer(players, playerId);
            leftPlayer.chips++;
            player.chips--;
        } else if (roll === 'R') {
            const rightPlayer = getRightPlayer(players, playerId);
            rightPlayer.chips++;
            player.chips--;
        } else if (roll === 'C') {
            const centerPlayer = players.find(p => p.player_id === 0);
            centerPlayer.chips++;
            player.chips--;
        }
    });

    for (const p of players) {
        await savePlayerTurn(gameId, p.player_id, p.chips, p.dice_result);
    }

    return players;
};

const getLeftPlayer = (players, playerId) => {
    const index = players.findIndex(p => p.player_id === playerId);
    return players[(index - 1 + players.length) % players.length];
};

const getRightPlayer = (players, playerId) => {
    const index = players.findIndex(p => p.player_id === playerId);
    return players[(index + 1) % players.length];
};

const checkForWinner = (players) => {
    const activePlayers = players.filter(player => player.chips > 0);
    return activePlayers.length === 1 ? activePlayers[0].player_id : null;
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
        console.log('Socket connected');

        // Handle get-available-rooms event
        socket.on('get-available-rooms', async () => {
            const rooms = await getRoomsFromDB();
            console.log('available rooms:', rooms);
            io.emit('availableRooms', rooms);  
        });

        // Handle room creation
        socket.on('createRoom', async (newRoom) => {
            if (!newRoom) return; // Don't proceed if no room name

            try {
                const createdRoom = await createRoomInDB(newRoom);
                console.log(`new room: ${newRoom} has been created`);
                if (createdRoom) {
                    io.emit('availableRooms', await getRoomsFromDB());  // Emit updated rooms list
                } else {
                    console.log('Room already exists');
                }
            } catch (error) {
                console.error('Error creating room:', error);
            }
        });

        // Handle join-room event
        socket.on('join-room', async ({ room, chatName }) => {
            console.log(`User with chat name ${chatName} joining room: ${room}`);
            socket.join(room);

            // Fetch message history for the room
            try {
                const messages = await getMessagesFromDB(room);
                socket.emit('messageHistory', messages); // Send message history to the user
            } catch (error) {
                console.error('Error fetching message history:', error);
            }

            // Broadcast that the user joined the room
            io.to(room).emit('user_joined', `${chatName} joined the room`);
        });

        // Handle leave-room event
        socket.on('leave-room', (room) => {
            console.log(`User left room: ${room}`);
            socket.leave(room);
            socket.to(room).emit('user_left', `${socket.id} left the room`);
        });

        // Handle removeRoom event
        socket.on('removeRoom', async (roomToRemove) => {
            console.log(`Removing room: ${roomToRemove}`);
            try {
                await client.query('DELETE FROM rooms WHERE name = $1', [roomToRemove]);
                io.emit('availableRooms', await getRoomsFromDB()); // Emit updated room list
            } catch (error) {
                console.error('Error deleting room:', error);
            }
        });

        // Handle message event (sending messages in rooms)
        socket.on('message', async ({ room, message, sender }) => {
            console.log(`Message from ${sender}: ${message}`);
            await saveMessageToDatabase(room, message, sender);
            io.to(room).emit('message', { sender, message });
        });

        // Handle playerTurn event (game logic)
        socket.on('playerTurn', async ({ room, playerId, rollResults }) => {
            const game = await createOrGetGame(room);
            if (!game) return;

            const updatedPlayers = await processTurn(game.id, playerId, rollResults);
            const winner = checkForWinner(updatedPlayers);
            if (winner) {
                await client.query('UPDATE games SET winner = $1 WHERE room_name = $2', [winner, room]);
            }

            await client.query('UPDATE games SET current_turn = current_turn + 1 WHERE room_name = $1', [room]);
            io.to(room).emit('gameStateUpdated', updatedPlayers);
        });
    });

    httpServer.listen(port, '0.0.0.0', () => {
        console.log(`Server listening on http://${hostname}:${port}`);
    });
}).catch((err) => {
    console.error('Error preparing Next.js app:', err);
});
