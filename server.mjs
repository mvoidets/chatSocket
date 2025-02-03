import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import { getServerSession } from 'next-auth'; 
import { authOptions } from './pages/api/auth/[...nextauth]'; 
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

    io.on("connection", (socket) => {
        console.log(`${socket.id} has connected`);

        // Get the token from the handshake query
        const token = socket.handshake.query.token;
        if (token) {
            getServerSession({ req: { headers: { cookie: `next-auth.session-token=${token}` } } }, authOptions)
                .then(userSession => {
                    if (userSession) {
                        socket.user = userSession.user;
                        console.log(`Authenticated as ${userSession.user.username}`);
                    } else {
                        socket.disconnect(true); // Disconnect if not authenticated
                    }
                })
                .catch(err => {
                    console.error('Session error:', err);
                    socket.disconnect(true); // Disconnect on error
                });
        } else {
            socket.disconnect(true); // Disconnect if no token is provided
        }

        // Handle createRoom event
        socket.on("createRoom", async (newRoom) => {
            const room = await createRoomInDB(newRoom);
            if (room) {
                io.emit("availableRooms", await getRoomsFromDB()); // Emit updated room list
            } else {
                console.log('Failed to create room');
            }
        });

        // Handle join-room event
        socket.on("join-room", async ({ room, userId }) => {
            console.log(`User with ID ${userId} joining room: ${room}`);
            const userRes = await client.query('SELECT user_name FROM users WHERE id = $1', [userId]);
            const username = userRes.rows[0]?.user_name;

            if (username) {
                socket.join(room);
                socket.emit("messageHistory", await getMessagesFromDB(room)); // Load message history
                io.to(room).emit("user_joined", `${username} joined the room`);
            } else {
                socket.emit("error", "User not found");
            }
        });

        // Handle leave-room event
        socket.on("leave-room", async (room) => {
            console.log(`User left room: ${room}`);
            socket.leave(room);
            socket.to(room).emit("user_left", `${socket.id} left the room`);
        });

        // Handle removeRoom event
        socket.on("removeRoom", async (roomToRemove) => {
            console.log(`Removing room: ${roomToRemove}`);
            try {
                await client.query('DELETE FROM rooms WHERE name = $1', [roomToRemove]);
                io.emit("availableRooms", await getRoomsFromDB()); // Emit updated room list
            } catch (error) {
                console.error("Error deleting room:", error);
            }
        });

        // Handle message event (sending messages in rooms)
        socket.on("message", async ({ room, message, sender }) => {
            console.log(`Message from ${sender}: ${message}`);
            await saveMessageToDatabase(room, message, sender);
            io.to(room).emit("message", { sender, message });
        });

        // Handle playerTurn event (game logic)
        socket.on("playerTurn", async ({ room, playerId, rollResults }) => {
            const game = await createOrGetGame(room);
            if (!game) return;

            const updatedPlayers = await processTurn(game.id, playerId, rollResults);
            const winner = checkForWinner(updatedPlayers);
            if (winner) {
                await client.query('UPDATE games SET winner = $1 WHERE room_name = $2', [winner, room]);
            }

            await client.query('UPDATE games SET current_turn = current_turn + 1 WHERE room_name = $1', [room]);
            io.to(room).emit("gameStateUpdated", updatedPlayers);
        });
    });

    httpServer.listen(port, '0.0.0.0', () => {
        console.log(`Server listening on http://${hostname}:${port}`);
    });
}).catch((err) => {
    console.error('Error preparing Next.js app:', err);
});

// import { createServer } from 'node:http';
// import next from 'next';
// import { Server } from 'socket.io';
// import { getServerSession } from 'next-auth'; 
// import { authOptions } from './pages/api/auth/[...nextauth]'; 
// import pkg from 'pg';
// const { Client } = pkg;

// const dev = process.env.NODE_ENV !== 'production';
// const hostname = process.env.HOSTNAME || 'localhost';
// const port = process.env.PORT || '3005';

// // Database client initialization
// const client = new Client({
//     connectionString: process.env.DATABASE_URL, // Make sure to set your DATABASE_URL in .env
// });

// client.connect().then(() => {
//     console.log('Connected to PostgreSQL database');
// }).catch((error) => {
//     console.error('Failed to connect to PostgreSQL:', error);
// });

// // Fetch available rooms from DB
// const getRoomsFromDB = async () => {
//     try {
//         const res = await client.query('SELECT name FROM rooms');
//         console.log('Rooms fetched from DB:', res.rows); // Log rooms to see if we have any
//         return res.rows.map(row => row.name); // Return room names
//     } catch (error) {
//         console.error('Error fetching rooms from DB:', error);
//         return [];
//     }
// };

// // Create new room in DB
// const createRoomInDB = async (newRoom) => {
//     try {
//         // Check if the room already exists
//         const checkRes = await client.query('SELECT * FROM rooms WHERE name = $1', [newRoom]);
//         if (checkRes.rows.length > 0) {
//             console.log('Room already exists');
//             return null;
//         }

//         // Insert the new room
//         const res = await client.query(
//             'INSERT INTO rooms (name) VALUES ($1) RETURNING *',
//             [newRoom]
//         );
//         console.log('Created room:', res.rows[0]);
//         return res.rows[0];
//     } catch (error) {
//         console.error('Error creating room in DB:', error);
//         return null;
//     }
// };

// // Save message to the database
// const saveMessageToDatabase = async (room, message, sender) => {
//     try {
//         const res = await client.query(
//             'INSERT INTO messages (room_name, message, sender) VALUES ($1, $2, $3) RETURNING *',
//             [room, message, sender]
//         );
//         console.log('Message saved to DB:', res.rows[0]);
//     } catch (error) {
//         console.error('Error saving message to DB:', error);
//     }
// };

// // Fetch message history from DB
// const getMessagesFromDB = async (room) => {
//     try {
//         const res = await client.query(
//             'SELECT sender, message FROM messages WHERE room_name = $1 ORDER BY created_at ASC',
//             [room]
//         );
//         return res.rows;
//     } catch (error) {
//         console.error('Error fetching messages from DB:', error);
//         return [];
//     }
// };

// //create or get game
// const createOrGetGame = async (room) => {
//     try {
//         const res = await client.query('SELECT * FROM games WHERE room_name = $1', [room]);
        
//         // If the game exists, return the game state
//         if (res.rows.length > 0) {
//             return res.rows[0];
//         } else {
//             // If no game exists, create a new one
//             const newGameRes = await client.query(
//                 'INSERT INTO games (room_name, current_turn) VALUES ($1, 1) RETURNING *',
//                 [room]
//             );
//             return newGameRes.rows[0];
//         }
//     } catch (error) {
//         console.error('Error fetching/creating game:', error);
//         return null;
//     }
// };

// //save player
// const savePlayerTurn = async (gameId, playerId, chips, diceResult) => {
//     try {
//         const res = await client.query(
//             'INSERT INTO players (game_id, player_id, chips, dice_result) VALUES ($1, $2, $3, $4) ON CONFLICT (game_id, player_id) DO UPDATE SET chips = $3, dice_result = $4, updated_at = CURRENT_TIMESTAMP RETURNING *',
//             [gameId, playerId, chips, diceResult]
//         );
//         return res.rows[0];
//     } catch (error) {
//         console.error('Error saving player turn:', error);
//     }
// };

// //player turn
// const processTurn = async (gameId, playerId, rollResults) => {
//     const playersRes = await client.query('SELECT * FROM players WHERE game_id = $1', [gameId]);
//     const players = playersRes.rows;

//     const player = players.find(p => p.player_id === playerId);
    
//     rollResults.forEach((roll) => {
//         if (roll === 'L') {
//             const leftPlayer = getLeftPlayer(players, playerId);
//             leftPlayer.chips++;
//             player.chips--;
//         } else if (roll === 'R') {
//             const rightPlayer = getRightPlayer(players, playerId);
//             rightPlayer.chips++;
//             player.chips--;
//         } else if (roll === 'C') {
//             // Add chips to the center pot (player 0)
//             const centerPlayer = players.find(p => p.player_id === 0);
//             centerPlayer.chips++;
//             player.chips--;
//         }
//     });

//     // Save the new player state in DB
//     for (const p of players) {
//         await savePlayerTurn(gameId, p.player_id, p.chips, p.dice_result);
//     }

//     return players; // Return the updated players list
// };

// //helper function
// const getLeftPlayer = (players, playerId) => {
//     const index = players.findIndex(p => p.player_id === playerId);
//     return players[(index - 1 + players.length) % players.length];
// };

// const getRightPlayer = (players, playerId) => {
//     const index = players.findIndex(p => p.player_id === playerId);
//     return players[(index + 1) % players.length];
// };
// //winner check
// const checkForWinner = (players) => {
//     const activePlayers = players.filter(player => player.chips > 0);
//     if (activePlayers.length === 1) {
//         return activePlayers[0].player_id;
//     }
//     return null;
// };
// //save game
// const saveGameTurn = async (gameId, playerId, rollResults) => {
//     try {
//         for (let i = 0; i < rollResults.length; i++) {
//             await client.query(
//                 'INSERT INTO game_turns (game_id, player_id, roll_result, turn_number) VALUES ($1, $2, $3, $4)',
//                 [gameId, playerId, rollResults[i], i + 1]
//             );
//         }
//     } catch (error) {
//         console.error('Error saving game turn:', error);
//     }
// };

// // game turn history
// const saveGameTurn = async (gameId, playerId, rollResults) => {
//     try {
//         for (let i = 0; i < rollResults.length; i++) {
//             await client.query(
//                 'INSERT INTO game_turns (game_id, player_id, roll_result, turn_number) VALUES ($1, $2, $3, $4)',
//                 [gameId, playerId, rollResults[i], i + 1]
//             );
//         }
//     } catch (error) {
//         console.error('Error saving game turn:', error);
//     }
// };

// // Main server initialization
// const app = next({ dev, hostname, port });
// const handle = app.getRequestHandler();

// app.prepare().then(() => {
//     const httpServer = createServer(handle);
//     const io = new Server(httpServer, {
//         cors: {
//             origin: "*",
//             methods: ["GET", "POST"],
//             allowedHeaders: ["Content-Type"],
//             credentials: true,
//         },
//     });

//     io.on("connection", (socket) => {
//         console.log(`${socket.id} has connected`);

//          // Get the token from the handshake query
//     const token = socket.handshake.query.token; // JWT or session token passed in the query

// //game locgic
// // Example of processing player turn on the server
// socket.on("playerTurn", async ({ room, playerId, rollResults }) => {
//     console.log(`Player ${playerId} in room ${room} rolled: ${rollResults}`);
    
//     // Process the turn (this would include the game logic such as L, R, C, and updating chips)
//     handleTurn(room, playerId, rollResults);

//     // After processing the turn, emit the updated game state to all players in the room
//     io.to(room).emit("gameStateUpdated", gameState[room]);
// });

        
//  // Handle createRoom event
//         socket.on("createRoom", async (newRoom) => {
//             const room = await createRoomInDB(newRoom);
//             if (room) {
//                 io.emit("availableRooms", await getRoomsFromDB()); // Emit updated room list
//             } else {
//                 console.log('Failed to create room');
//             }
//         });

// //join room
//         socket.on("join-room", async ({ room, userId }) => {
//             console.log(`User with ID ${userId} is attempting to join room: ${room}`);

//             // Fetch the username from the database using the userId
//             const userRes = await client.query('SELECT user_name FROM users WHERE id = $1', [userId]);
//             const username = userRes.rows[0]?.user_name;

//             if (username) {
//                 console.log(`User ${username} joined room: ${room}`);
//                 socket.join(room);

//                 const roomRes = await client.query('SELECT id FROM rooms WHERE name = $1', [room]);
//                 const roomId = roomRes.rows[0]?.id;

//                 if (roomId) {
//                     await client.query('INSERT INTO room_users (room_id, user_name) VALUES ($1, $2)', [roomId, username]);
//                     console.log(`User ${username} added to room_users table`);

//                     socket.to(room).emit("user_joined", `${username} joined the room`);

//                     const messages = await getMessagesFromDB(room); // Assume this function is implemented to fetch messages
//                     socket.emit("messageHistory", messages);
//                 }
//             } else {
//                 console.log(`User with ID ${userId} not found`);
//                 socket.emit("error", "User not found in the database");
//             }
//         });
// //deleting room
//         socket.on("removeRoom", async (roomToRemove) => {
//             console.log(`Attempting to remove room: ${roomToRemove}`);

//             // Delete the room from the database
//             try {
//                 const res = await client.query('DELETE FROM rooms WHERE name = $1', [roomToRemove]);
//                 console.log(`Room ${roomToRemove} deleted from DB`);

//                 // Emit the updated room list to all connected clients
//                 io.emit("availableRooms", await getRoomsFromDB());
//             } catch (error) {
//                 console.error("Error deleting room:", error);
//             }
//         });
//     //leave room
//         socket.on("leave-room", async (room) => {
//             console.log(`User left room: ${room}`);
//             socket.leave(room);

//             const roomRes = await client.query('SELECT id FROM rooms WHERE name = $1', [room]);
//             const roomId = roomRes.rows[0]?.id;

//             if (roomId) {
//                 await client.query('DELETE FROM room_users WHERE room_id = $1 AND user_name = $2', [roomId, socket.id]);
//                 console.log(`User removed from room_users table`);

//                 socket.to(room).emit("user_left", `${socket.id} left the room`);
//             }
//         });
//        // Handle message event (sending messages in rooms)
//         socket.on("message", async ({ room, message, sender }) => {
//             console.log(`Received message in room ${room} from ${sender}: ${message}`);

//             // Save the message to the database
//             await saveMessageToDatabase(room, message, sender);

//             // Broadcast the message to the room
//             io.to(room).emit("message", { sender, message });
//         });

// //player turn
        
// socket.on("playerTurn", async ({ room, playerId, rollResults }) => {
//     // Fetch or create the game
//     const game = await createOrGetGame(room);
    
//     if (!game) return;

//     // Update game state (e.g., next turn, check for winner)
//     let currentTurn = game.current_turn;

//     // Simulate dice result processing
//     const updatedPlayers = await processTurn(game.id, playerId, rollResults);

//       // Save the player's turn (historical data)
//     await saveGameTurn(game.id, playerId, rollResults);
//     // Save the player’s turn result in the DB
//     await savePlayerTurn(game.id, playerId, updatedPlayers[playerId].chips, rollResults);

//     // Check for winner or end of game
//     const winner = checkForWinner(updatedPlayers);
//     if (winner) {
//         // Update game state with the winner
//         await client.query('UPDATE games SET winner = $1 WHERE room_name = $2', [winner, room]);
//     }

//     // Increment the current turn
//     await client.query('UPDATE games SET current_turn = current_turn + 1 WHERE room_name = $1', [room]);

//     // Emit the updated game state
//     io.to(room).emit("gameStateUpdated", updatedPlayers);
// });


        
//     });

 

//     httpServer.listen(port, '0.0.0.0', () => {
//         console.log(`Server is listening on http://${hostname}:${port}`);
//     });
// }).catch((err) => {
//     console.error('Error preparing Next.js app:', err);
// });

// // import { createServer } from 'node:http';
// // import next from 'next';
// // import { Server } from 'socket.io';
// // import pkg from 'pg';
// // const { Client } = pkg;


// // const dev = process.env.NODE_ENV !== 'production';
// // const hostname = process.env.HOSTNAME || 'localhost';
// // const port = process.env.PORT || '3005';

// // const client = new Client({
// //     connectionString: process.env.DATABASE_URL,
// // });

// // client.connect().then(() => {
// //     console.log('Connected to PostgreSQL database');
// // }).catch((error) => {
// //     console.error('Failed to connect to PostgreSQL:', error);
// // });

// // const app = next({ dev, hostname, port });
// // const handle = app.getRequestHandler();

// // const getRoomsFromDB = async () => {
// //     try {
// //         const res = await client.query('SELECT name FROM rooms');
// //         return res.rows.map(row => row.name);
// //     } catch (error) {
// //         console.error('Error fetching rooms from DB:', error);
// //         return [];
// //     }
// // };

// // const createRoomInDB = async (newRoom) => {
// //     try {
// //         const checkRes = await client.query('SELECT * FROM rooms WHERE name = $1', [newRoom]);
// //         if (checkRes.rows.length > 0) return null;

// //         const res = await client.query('INSERT INTO rooms (name) VALUES ($1) RETURNING *', [newRoom]);
// //         return res.rows[0];
// //     } catch (error) {
// //         console.error('Error creating room in DB:', error);
// //         return null;
// //     }
// // };

// // const getUsersInRoom = async (room) => {
// //     try {
// //         const roomRes = await client.query('SELECT id FROM rooms WHERE name = $1', [room]);
// //         const roomId = roomRes.rows[0]?.id;

// //         if (roomId) {
// //             const usersRes = await client.query('SELECT user_name FROM room_users WHERE room_id = $1', [roomId]);
// //             return usersRes.rows.map(row => row.user_name);
// //         }
// //         return [];
// //     } catch (error) {
// //         console.error('Error fetching users from room_users table:', error);
// //         return [];
// //     }
// // };

// // app.prepare().then(() => {
// //     const httpServer = createServer(handle);
// //     const io = new Server(httpServer, {
// //         cors: {
// //             origin: "*",
// //             methods: ["GET", "POST"],
// //             allowedHeaders: ["Content-Type"],
// //             credentials: true,
// //         },
// //     });

// //     io.on("connection", (socket) => {
// //         console.log(`${socket.id} has connected`);

// //         socket.on("join-room", async ({ room, username }) => {
// //             console.log(`User ${username} joined room: ${room}`);
// //             socket.join(room);

// //             const roomRes = await client.query('SELECT id FROM rooms WHERE name = $1', [room]);
// //             const roomId = roomRes.rows[0]?.id;

// //             if (roomId) {
// //                 await client.query('INSERT INTO room_users (room_id, user_name) VALUES ($1, $2)', [roomId, username]);
// //                 console.log(`User ${username} added to room_users table`);
// //                 socket.to(room).emit("user_joined", `${username} joined the room`);

// //                 const messages = await getMessagesFromDB(room);
// //                 socket.emit("messageHistory", messages);
// //             }
// //         });

// //         socket.on("leave-room", async (room) => {
// //             console.log(`User left room: ${room}`);
// //             socket.leave(room);

// //             const roomRes = await client.query('SELECT id FROM rooms WHERE name = $1', [room]);
// //             const roomId = roomRes.rows[0]?.id;

// //             if (roomId) {
// //                 await client.query('DELETE FROM room_users WHERE room_id = $1 AND user_name = $2', [roomId, socket.id]);
// //                 console.log(`User removed from room_users table`);

// //                 socket.to(room).emit("user_left", `${socket.id} left the room`);
// //             }
// //         });

// //         socket.on("createRoom", async (newRoom) => {
// //             const room = await createRoomInDB(newRoom);
// //             if (room) {
// //                 io.emit("availableRooms", await getRoomsFromDB());
// //             }
// //         });
// //     });
      
// //     socket.on("get-users-in-room", async (room) => {
// //         const users = await getUsersInRoom(room);
// //         socket.emit("users-in-room", users); // Send back the list of users
// //     });
    
// //     httpServer.listen(port, '0.0.0.0', () => {
// //         console.log(`Server is listening on http://${hostname}:${port}`);
// //     });
// // }).catch((err) => {
// //     console.error('Error preparing Next.js app:', err);
// // });
