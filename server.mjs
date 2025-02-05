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
    console.log("Rooms from DB:", getRoomsFromDB);
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
// Define getMessagesFromDB function
const getMessagesFromDB = async (roomId) => {
    try {
        const { rows } = await client.query('SELECT * FROM messages WHERE room_id = $1', [roomId]);
        return rows;
    } catch (error) {
        console.error('Error fetching messages:', error);
        return [];
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
// export async function getMessagesFromDB(roomName) {
//     try {
//         const res = await client.query(
//             'SELECT sender, message, created_at FROM messages WHERE room_name = $1 ORDER BY created_at ASC',
//             [roomName]
//         );
//         return res.rows; // Return messages ordered by creation time
//     } catch (error) {
//         console.error('Error fetching messages from DB:', error);
//         return []; // Return empty array if there's an error
//     }
// }

// Dice rolling logic
const rollDice = (chips) => {
    const rollResults = [];
    for (let i = 0; i < chips; i++) {
        rollResults.push(Math.floor(Math.random() * 6) + 1);
    }
    return rollResults;
};

// Process dice roll results and update player state
const processDiceResults = async (diceResults, playerId, room) => {
    try {
        const totalRoll = diceResults.reduce((sum, roll) => sum + roll, 0);
        const updatedPlayers = await updatePlayerChips(playerId, totalRoll, room);
        return updatedPlayers;
    } catch (error) {
        console.error('Error processing dice results:', error);
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
    });
io.on('connection', (socket) => {
    console.log('A player connected');

    socket.on('roll-dice', async ({ playerId, currentChips, room }) => {
        try {
            // Roll the dice
            const diceResults = rollDice(currentChips);

            // Process the dice results and update players
            const updatedPlayers = await processDiceResults(diceResults, playerId, room);

            // Emit updated game state to all players in the room
            io.to(room).emit('gameStateUpdated', updatedPlayers);

            // Emit dice result to the player who rolled
            socket.emit('diceResult', diceResults);
        } catch (error) {
            console.error('Error rolling dice:', error);
            socket.emit('error', 'An error occurred while processing your turn.');
        }
    });

    // Room join handling
  
    socket.on('join-room', async (room) => {
        socket.join(room);
        console.log(`Player joined room: ${room}`);
        
        try {
            const messages = await getMessagesFromDB(room);
            io.to(room).emit('messages', messages); // Emit messages to clients in the room
        } catch (error) {
            console.error('Error fetching messages:', error);
            socket.emit('error', 'Error fetching messages.');
        }
    });

      // Handle fetching available rooms
        socket.on('get-available-rooms', async () => {
            try {
                const rooms = await getRoomsFromDB();
                io.emit('availableRooms', rooms);
            } catch (error) {
                console.error('Error fetching available rooms:', error);
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
            } catch (error) {
                console.error('Error fetching available rooms:', error);
            }
        });


       // Handle join-room event
        socket.on('join-room', async ({ room, userName }) => {
            console.log(`User with chat name ${userName} joining room: ${room}`);
            socket.join(room);

            try {
                // Get or create the game if it doesn't exist
                const game = await createOrGetGame(room);
                if (!game) {
                    console.error('Game not found!');
                    return;
                }

                // Check if the player already exists in the players table for this game
                const checkPlayer = await client.query('SELECT * FROM players WHERE game_id = $1 AND playername = $2', [game.id, userName]);
                // If the player doesn't exist, add them to the players table
                if (checkPlayer.rows.length === 0) {
                    // Add the player to the database
                    const res = await client.query('INSERT INTO players (game_id, playername, chips) VALUES ($1, $2, $3) RETURNING *', [game.id, userName, 3]); // Initial chips
                    console.log(`Player added: ${playername}`);
                }
                // Insert player’s turn in the players_turn table (only if it’s the first player)
                const playerId = checkPlayer.rows.length === 0 ? res.rows[0].id : checkPlayer.rows[0].id;
                const currentTurn = await client.query('SELECT * FROM players_turn WHERE game_id = $1 ORDER BY turn_number ASC LIMIT 1', [game.id]);

                if (currentTurn.rows.length === 0) {
                    // If no player turn records exist, make the current player the first player
                    await client.query(
                        'INSERT INTO players_turn (game_id, player_id, turn_number) VALUES ($1, $2, 1)',
                        [game.id, playerId]
                    );
                }
                // Fetch the message history for the room
                const messages = await getMessagesFromDB(room);
                socket.emit('messageHistory', messages); // Send message history to the user

                // Broadcast that the user joined the room
                io.to(room).emit('user_joined', `${userName} joined the room`);
            } catch (error) {
                console.error('Error joining room:', error);
            }
        });

    //joining game/ multi player
    io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    // Add player to the game queue
    addToGameQueue(socket);

    // Listen for disconnecting player
    socket.on('disconnect', () => {
        console.log(`Player ${socket.id} disconnected`);
        gameQueue = gameQueue.filter(player => player.id !== socket.id);
    });
});


        // Handle leave-room event
        socket.on('leave-room', (room) => {
            console.log(`User: ${userName}, has left the room: ${room}`);
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
            console.log(`Message from ${sender}: ${message}`);
            await saveMessageToDatabase(room, message, sender);
            io.to(room).emit('message', { sender, message });
        });

        // When the client emits 'roll-dice', handle the dice roll and update DB
        socket.on('roll-dice', async ({ playerId, currentChips, room }) => {
            try {
                // Step 1: Roll the dice
                const diceResults = rollDice(currentChips); // This would be your dice logic

                // Step 2: Process the dice results (update players, chips, etc.)
                const updatedPlayers = await processDiceResults(diceResults, playerId, room);

                // Step 3: Update the database with new player states
                await updatePlayerChips(updatedPlayers);

                // Step 4: Emit the results back to the client
                io.to(room).emit('gameStateUpdated', updatedPlayers); // Broadcast to room

                // Optionally, emit the dice results for the current player
                socket.emit('diceResult', diceResults);
            } catch (error) {
                console.error('Error rolling dice:', error);
                socket.emit('error', 'An error occurred while processing your turn.');
            }
        });
  })

httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://${hostname}:${port}`);
});
}).catch((err) => {
console.error('Error preparing app:', err);
});
