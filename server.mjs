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
        //console.log('Message from DB:', message);
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
        //console.error('Error processing dice results:', error);
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

    });
    io.on('connection', (socket) => {
        console.log(`A player connected: ${socket.id}`);

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
                socket.join(room);
                console.log(`${userName} joined the room: ${room}`);

                // Fetch or create the game
                // const game = await createOrGetGame(room);
                // if (!game) {
                //     console.error('Game not found!');
                //     return;
                // }

                // Check if the player already exists in the database for the room/game
                // const checkPlayer = await client.query('SELECT * FROM players WHERE game_id = $1 AND playername = $2', [game.id, userName]);
                // if (checkPlayer.rows.length === 0) {
                //     // Add the player if they don't exist in the players table
                //     const res = await client.query('INSERT INTO players (game_id, playername, chips) VALUES ($1, $2, $3) RETURNING *', [game.id, userName, 3]); // Initial chips
                //     console.log(`Player added: ${userName}`);
                // }

                // Insert the player’s turn into the players_turn table if it's the first player
                // const playerId = checkPlayer.rows.length === 0 ? res.rows[0].id : checkPlayer.rows[0].id;
                // const currentTurn = await client.query('SELECT * FROM players_turn WHERE game_id = $1 ORDER BY turn_number ASC LIMIT 1', [game.id]);

                // if (currentTurn.rows.length === 0) {
                //     // Set the current player as the first player
                //     await client.query(
                //         'INSERT INTO players_turn (game_id, player_id, turn_number) VALUES ($1, $2, 1)',
                //         [game.id, playerId]
                //     );
                //}

                // Fetch message history for the room and send it to the client
                const messages = await getMessagesFromDB(room, userName);
                socket.emit('messageHistory', messages);

                // Broadcast that the user has joined the room to all others in the room
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


        // // Array to store players waiting for the game
        // let gameQueue = [];

        // io.on('connection', (socket) => {
        //     console.log('A player connected:', socket.id);

        //     // Add player to the game queue when they connect
        //     addToGameQueue(socket);

        //     // Listen for a disconnecting player
        //     socket.on('disconnect', () => {
        //         console.log(`Player ${socket.id} disconnected`);
        //         gameQueue = gameQueue.filter(player => player.id !== socket.id);
        //         // Emit to the clients that a player left
        //         io.emit('gameQueueUpdated', gameQueue);
        //     });
        // });

        // Function to add player to the game queue
        // const addToGameQueue = (socket) => {
        //     // Add the player to the queue
        //     gameQueue.push({
        //         id: socket.id,
        //         username: socket.username || `Player ${gameQueue.length + 1}`, // You can customize this to store player names
        //     });

        //    // console.log(`Player ${socket.id} added to the queue`);

        //     // Emit the updated game queue to all connected clients
        //     io.emit('gameQueueUpdated', gameQueue);

        //     // If there are enough players (e.g. 2), start the game
        //     if (gameQueue.length >= 2) {
        //         io.emit('startGame', gameQueue);
        //         // Now you can reset the game queue or do other logic to start the game
        //         gameQueue = []; // Clear the queue after the game starts
        //     }
        // };


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
