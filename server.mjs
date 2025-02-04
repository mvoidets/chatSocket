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
        // Reconnect to DB if not already connected
        if (!client._connected) {
            console.log('Reconnecting to database');
            await client.connect();
        }

        // Check if the room exists in the rooms table
        const roomRes = await client.query('SELECT * FROM rooms WHERE name = $1', [room]);
        
        if (roomRes.rows.length === 0) {
            // Room doesn't exist, insert the room into the rooms table
            await client.query('INSERT INTO rooms (name) VALUES ($1)', [room]);
            console.log(`Room ${room} created in the rooms table.`);
        }

        // Check if the game already exists in the games table for this room
        const gameRes = await client.query('SELECT * FROM games WHERE room_name = $1', [room]);

        if (gameRes.rows.length > 0) {
            // Game already exists for this room, return the game
            return gameRes.rows[0];
        }

        // If no game exists, create a new game and insert into the games table
        const newGameRes = await client.query(
            'INSERT INTO games (room_name, current_turn) VALUES ($1, 1) RETURNING *',
            [room]
        );

        // Fetch the new game to return
        return newGameRes.rows[0];

    } catch (error) {
        console.error('Error creating or getting game:', error);
        return null;
    }
};


//add player to game
const addPlayerToGame = async (gameId, playerName, isAI = false) => {
    try {
        const playerRes = await client.query(
            'INSERT INTO players (game_id, player_name, is_ai, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
            [gameId, playerName, isAI]
        );

        return playerRes.rows[0];
    } catch (error) {
        console.error('Error adding player:', error);
        return null;
    }
};

const updateGameState = async (room, playerId, rollResults) => {
    try {
        const gameRes = await client.query('SELECT * FROM games WHERE room_name = $1', [room]);
        const game = gameRes.rows[0];

        const playersRes = await client.query('SELECT * FROM players WHERE game_id = $1', [game.id]);
        const players = playersRes.rows;

        const currentPlayer = players.find(player => player.id === playerId);

        // Update game state logic
        if (rollResults) {
            currentPlayer.chips += rollResults; // Modify according to your game rules
            await client.query('UPDATE players SET chips = $1 WHERE id = $2', [currentPlayer.chips, currentPlayer.id]);
        }

        return {
            game: game,
            players: players
        };
    } catch (error) {
        console.error('Error updating game state:', error);
        throw error; // Re-throw the error to handle it outside the function if needed
    }
};

const processTurn = async (gameId) => {
    // Get the players and current turn
    const playersRes = await client.query('SELECT * FROM players WHERE game_id = $1', [gameId]);
    const players = playersRes.rows;

    const currentTurnRes = await client.query('SELECT current_turn FROM games WHERE id = $1', [gameId]);
    const currentTurn = currentTurnRes.rows[0].current_turn;

    const currentPlayer = players[currentTurn % players.length];

    // Call processPlayerTurn to handle player-specific turn logic
    await processPlayerTurn(gameId, currentPlayer.player_id, currentPlayer.dice_results);

    // Update current_turn and broadcast to all players
    await client.query('UPDATE games SET current_turn = current_turn + 1 WHERE id = $1', [gameId]);
    io.to(gameId).emit('gameStateUpdated', players);

    // Return players
    return players;
};

const processPlayerTurn = async (gameId, playerId, rollResults) => {
  
    // Update player chips and roll results here
    const chipsBeforeTurn = 3;  // Placeholder, get from DB
    const chipsAfterTurn = chipsBeforeTurn - calculateChipsAfterTurn(rollResults);

    await client.query(
        'UPDATE players SET chips = $1, dice_results = $2 WHERE player_id = $3',
        [chipsAfterTurn, rollResults, playerId]
    );
};


const getLeftPlayer = (players, playerId) => {
    const index = players.findIndex(p => p.player_id === playerId);
    return players[(index - 1 + players.length) % players.length];
};

const getRightPlayer = (players, playerId) => {
    const index = players.findIndex(p => p.player_id === playerId);
    return players[(index + 1) % players.length];
};

// Add player to the database if they don't already exist verify game.id
// const checkPlayer = await client.query('SELECT * FROM players WHERE game_id = $1 AND name = $2', [game.id, chatName]);
// if (checkPlayer.rows.length === 0) {
//     const res = await client.query('INSERT INTO players (game_id, name, chips) VALUES ($1, $2, $3) RETURNING *', [game.id, chatName, 3]); // Initial chips
//     console.log(`Player added: ${chatName}`);
// }

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
socket.setMaxListeners(20); // Set the limit to 20 listeners for this specific socket

    io.on('connection', (socket) => {
        console.log('Socket connected');
        console.log(`A player has connected`);
        socket.removeAllListeners('playerTurn');
        
        
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

      

        // Handle join-room event
   socket.on('join-room', async ({ room, chatName }) => {
    console.log(`User with chat name ${chatName} joining room: ${room}`);
    socket.join(room);

    try {
        // Insert player into the players table in the database
        const game = await createOrGetGame(room); // Get or create game if it doesn't exist
        if (!game) {
            console.error('Game not found!');
            return;
        }

        // Add player to the database if they don't already exist
        const checkPlayer = await client.query('SELECT * FROM players WHERE game_id = $1 AND name = $2', [game.id, chatName]);
        if (checkPlayer.rows.length === 0) {
            const res = await client.query('INSERT INTO players (game_id, name, chips) VALUES ($1, $2, $3) RETURNING *', [game.id, chatName, 3]); // Initial chips
            console.log(`Player added: ${chatName}`);
        }

        // Add AI players if there are fewer than 6 players in the room
        let currentPlayers = await client.query('SELECT * FROM players WHERE game_id = $1', [game.id]);
        while (currentPlayers.rows.length < 6) {
            const aiPlayerName = `AI Player ${currentPlayers.rows.length + 1}`;
            await client.query('INSERT INTO players (game_id, name, chips, is_ai) VALUES ($1, $2, $3, $4) RETURNING *', [game.id, aiPlayerName, 3, true]); // Add AI player with 3 chips
            currentPlayers = await client.query('SELECT * FROM players WHERE game_id = $1', [game.id]);
        }

        // Fetch message history for the room
        const messages = await getMessagesFromDB(room);
        socket.emit('messageHistory', messages); // Send message history to the user

        // Broadcast that the user joined the room
        io.to(room).emit('user_joined', `${chatName} joined the room`);

        // Emit the updated players list after adding AI players (if any)
        io.to(room).emit('gameStateUpdated', currentPlayers.rows);
    } catch (error) {
        console.error('Error joining room:', error);
    }
});

        // Handle leave-room event
      socket.on('leave-room', async (room, playerId) => {
    console.log(`User with player ID ${playerId} left room: ${room}`);
    socket.leave(room);

    try {
        // Optionally remove the player from the database
        await client.query('DELETE FROM players WHERE game_id = $1 AND player_id = $2', [room, playerId]);

        // Optionally, update game state and check if game should be ended or adjusted
        const gameState = await getGameState(room); // Retrieve current game state
        const remainingPlayers = gameState.players.filter(player => player.id !== playerId);

        if (remainingPlayers.length === 0) {
            // If no players remain, you could consider ending the game
            console.log(`No players left in room ${room}, ending the game.`);
            await client.query('DELETE FROM games WHERE game_id = $1', [room]); // Remove game from DB
            io.to(room).emit('game-ended', 'The game has been ended because no players remain.');
        } else {
            // Otherwise, update game state and notify remaining players
            io.to(room).emit('gameStateUpdated', { players: remainingPlayers });
            io.to(room).emit('user_left', `${socket.id} left the room`);
        }
    } catch (error) {
        console.error('Error when a user leaves the room:', error);
    }
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

        // Handle playerTurn event (game logic)
        io.on('connection', (socket) => {
            
socket.on('playerTurn', async (data) => {
    const { room, playerId, rollResults } = data;

    try {
        // Update the game state with the new roll results or player move
        const updatedGameState = await updateGameState(room, playerId, rollResults);

        // Emit updated game state to all players in the room
        io.to(room).emit('gameStateUpdated', updatedGameState);

        // Handle turn for AI if the current player is AI
        const nextPlayer = getNextPlayer(updatedGameState, playerId);

        // If the next player is AI, simulate their turn automatically
        if (nextPlayer.is_ai) {
            // Here you can define AI behavior (e.g., random dice roll)
            const aiRollResults = ['L', 'R', 'C']; // Example AI roll results, you can randomize it or add logic
            console.log(`AI Player ${nextPlayer.id} is taking their turn with results: ${aiRollResults}`);

            // Process AI's turn by calling the same game logic used for player turns
            const aiUpdatedGameState = await updateGameState(room, nextPlayer.id, aiRollResults);

            // Emit updated game state to all players
            io.to(room).emit('gameStateUpdated', aiUpdatedGameState);

            // Notify the next player to take their turn
            const aiNextPlayer = getNextPlayer(aiUpdatedGameState, nextPlayer.id);
            const aiNextTurnMessage = `It's now ${aiNextPlayer.name}'s turn!`;
            io.to(room).emit('current-turn', aiNextTurnMessage);
        } else {
            // If the next player is human, just notify the next turn message
            const nextTurnMessage = `It's now ${nextPlayer.name}'s turn!`;
            io.to(room).emit('current-turn', nextTurnMessage);
        }

    } catch (error) {
        console.error('Error processing player turn:', error);
    }
});

// Handle next turn (move the game forward and update turn table)
socket.on('next-turn', async ({ room }) => {
    // Get the current player turn from player_turns table
    const currentTurn = await client.query('SELECT * FROM player_turns WHERE room_id = $1 ORDER BY turn_order LIMIT 1', [room]);

    // Get the next player (you can cycle through the players or use a game logic)
    const nextTurnOrder = currentTurn.rows[0].turn_order + 1;
    const nextPlayer = await client.query(
        'SELECT * FROM players WHERE room_id = $1 AND turn_order = $2',
        [room, nextTurnOrder]
    );

    if (nextPlayer.rows.length > 0) {
        const nextPlayerId = nextPlayer.rows[0].id;
        // Update player_turns table to reflect the next player's turn
        await client.query(
            'UPDATE player_turns SET is_active = false WHERE room_id = $1 AND player_id = $2',
            [room, currentTurn.rows[0].player_id]
        );
        await client.query(
            'UPDATE player_turns SET is_active = true WHERE room_id = $1 AND player_id = $2',
            [room, nextPlayerId]
        );

        // Emit the updated turn information
        const updatedTurn = await client.query('SELECT * FROM player_turns WHERE room_id = $1', [room]);
        socket.emit('gameStateUpdated', updatedTurn.rows);
        socket.broadcast.to(room).emit('turnChanged', nextPlayer.rows[0].name);
    }
});

        //         socket.on('playerTurn', async ({ room, playerId, rollResults }) => {
        //     const game = await createOrGetGame(room);
        //     if (!game) return;

        //     // Process the player's turn and update game state
        //     const updatedPlayers = await processTurn(game.id);

        //     // Broadcast updated game state to all players
        //     io.to(room).emit('gameStateUpdated', updatedPlayers);
        // });
        //     socket.on('playerTurn', async ({ room, playerId, rollResults }) => {
        //         const game = await createOrGetGame(room);
        //         if (!game) return;

        //         const updatedPlayers = await processTurn(game.id, playerId, rollResults);
        //         const winner = checkForWinner(updatedPlayers);
        //         if (winner) {
        //             await client.query('UPDATE games SET winner = $1 WHERE room_name = $2', [winner, room]);
        //             console.log("Winner is: ", winner);
        //         }

        //         await client.query('UPDATE games SET current_turn = current_turn + 1 WHERE room_name = $1', [room]);
        //         io.to(room).emit('gameStateUpdated', updatedPlayers);
        });
    });

    httpServer.listen(port, '0.0.0.0', () => {
        console.log(`Server listening on http://${hostname}:${port}`);
    });
}).catch((err) => {
    console.error('Error preparing Next.js app:', err);
});
