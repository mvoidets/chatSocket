
import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import fs from 'fs';  // Import the filesystem module

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT || '3005';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Helper functions to read/write game state from/to a file
const getGamesFromFile = () => {
    try {
        const data = fs.readFileSync('games.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};  // Return an empty object if file doesn't exist
    }
};

const saveGamesToFile = (games) => {
    fs.writeFileSync('games.json', JSON.stringify(games), 'utf8');
};

app.prepare().then(() => {
    console.log('Next.js app prepared successfully.');

    const httpServer = createServer(handle); // This will serve your Next.js app
    const io = new Server(httpServer, {
        cors: {
            origin: "*",  // Allow all origins, or specify your frontend URL
            methods: ["GET", "POST"],
            allowedHeaders: ["Content-Type"],
            credentials: true,
        },
    });

    io.on("connection", (socket) => {
        console.log(`${socket.id} has connected`);

        // Fetch existing games from the file
        const games = getGamesFromFile();

        // Send available games to the client
        socket.emit("availableGames", Object.keys(games));

        // Handle game creation
        socket.on("createGame", ({ gameId, playerName }) => {
            if (games[gameId]) {
                socket.emit("error", "Game already exists!");
                return;
            }
            
            // Create a new game state
            games[gameId] = {
                players: [playerName],
                chips: { [playerName]: 3 },
                currentTurn: 0,
            };
            saveGamesToFile(games);  // Save the game state
            socket.join(gameId);
            io.emit("availableGames", Object.keys(games));  // Broadcast updated game list
            io.to(gameId).emit("gameUpdated", games[gameId]);  // Notify game room of new player
        });

        // Handle player joining a game
        socket.on("joinGame", ({ gameId, playerName }) => {
            if (!games[gameId]) {
                socket.emit("error", "Game not found!");
                return;
            }

            const game = games[gameId];
            if (game.players.length >= 6) {
                socket.emit("error", "Game is full!");
                return;
            }

            if (game.players.includes(playerName)) {
                socket.emit("error", "Player already in game!");
                return;
            }

            game.players.push(playerName);
            game.chips[playerName] = 3;  // Give player 3 chips
            saveGamesToFile(games);  // Save updated game state
            socket.join(gameId);
            io.to(gameId).emit("gameUpdated", game);  // Notify game room of new player
        });

        // Handle dice roll
        socket.on("rollDice", ({ gameId }) => {
            const game = games[gameId];
            if (!game) {
                socket.emit("error", "Game not found!");
                return;
            }

            const player = game.players[game.currentTurn];
            if (!player) return;

            const dice = ["L", "R", "C", "-"];
            const rolls = [
                dice[Math.floor(Math.random() * dice.length)],
                dice[Math.floor(Math.random() * dice.length)],
                dice[Math.floor(Math.random() * dice.length)],
            ];

            // Apply dice rolls to the game state
            rolls.forEach((roll) => {
                if (roll === "L") {
                    const index = game.players.indexOf(player);
                    const leftPlayer = game.players[(index - 1 + game.players.length) % game.players.length];
                    game.chips[player]--;
                    game.chips[leftPlayer]++;
                } else if (roll === "R") {
                    const index = game.players.indexOf(player);
                    const rightPlayer = game.players[(index + 1) % game.players.length];
                    game.chips[player]--;
                    game.chips[rightPlayer]++;
                } else if (roll === "C") {
                    game.chips[player]--;
                }
            });

            // Move to the next player's turn
            game.currentTurn = (game.currentTurn + 1) % game.players.length;
            saveGamesToFile(games);  // Save updated game state
            io.to(gameId).emit("gameUpdated", game);  // Notify game room of updated game state
        });

        // Handle disconnect event
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





// import { createServer } from 'node:http';
// import next from 'next';
// import { Server } from 'socket.io';
// import fs from 'fs';  // Import the filesystem module

// const dev = process.env.NODE_ENV !== 'production';
// const hostname = process.env.HOSTNAME || 'localhost';
// const port = process.env.PORT || '3005';

// // Log environment variables to ensure they're set correctly
// console.log('Environment:', process.env.NODE_ENV);
// console.log('HOSTNAME:', hostname);
// console.log('PORT:', port);

// const app = next({ dev, hostname, port });
// const handle = app.getRequestHandler();

// // Helper function to read rooms from a file
// const getRoomsFromFile = () => {
//     try {
//         const data = fs.readFileSync('rooms.json', 'utf8');
//         return JSON.parse(data);
//     } catch (error) {
//         return []; // Return an empty array if file doesn't exist
//     }
// };

// // Helper function to save rooms to a file
// const saveRoomsToFile = (rooms) => {
//     fs.writeFileSync('rooms.json', JSON.stringify(rooms), 'utf8');
// };

// app.prepare().then(() => {
//     console.log('Next.js app prepared successfully.');

//     const httpServer = createServer(handle); // This will serve your Next.js app
//     const io = new Server(httpServer, {
//         cors: {
//             origin: "*",  // This allows all origins, or you can specify the frontend URL
//             methods: ["GET", "POST"],
//             allowedHeaders: ["Content-Type"],
//             credentials: true,
//         },
//     });

//     io.on("connection", (socket) => {
//         console.log(`${socket.id} has connected`);

//         // Fetch available rooms from the file
//         const rooms = getRoomsFromFile();
        
//         // Send available rooms to the client
//         socket.emit("availableRooms", rooms);

//         socket.on("join-room", ({ room, username }) => {
//             console.log(`User ${username} joined room: ${room}`);
//             socket.join(room);
//             socket.to(room).emit("user_joined", `${username} joined the room`);
//         });

//         socket.on("createRoom", (newRoom) => {
//             const rooms = getRoomsFromFile();
//             rooms.push(newRoom);
//             saveRoomsToFile(rooms);  // Save to file
//             io.emit("availableRooms", rooms);  // Broadcast updated rooms list
//         });

//         socket.on("removeRoom", (roomToRemove) => {
//             let rooms = getRoomsFromFile();
//             rooms = rooms.filter((room) => room !== roomToRemove);
//             saveRoomsToFile(rooms);  // Save updated rooms to file
//             io.emit("availableRooms", rooms);  // Broadcast updated rooms list
//         });

//         socket.on("message", ({ room, message, sender }) => {
//             console.log(`Message from ${sender} in room ${room}: ${message}`);
//             socket.to(room).emit("message", { sender, message });
//         });

//         socket.on("get-available-rooms", () => {
//           const rooms = getRoomsFromFile(); // Fetch rooms from the file or database
//           socket.emit("availableRooms", rooms); // Send the list of rooms to the client
//         });

//         socket.on("disconnect", () => {
//             console.log(`User disconnected: ${socket.id}`);
//         });
//     });

//     httpServer.listen(port, '0.0.0.0', () => {
//         console.log(`Server is listening on http://${hostname}:${port}`);
//     });
// }).catch((err) => {
//     console.error('Error preparing Next.js app:', err);
// });
