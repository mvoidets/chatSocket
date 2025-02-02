
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
    connectionString: process.env.DATABASE_URL, // Make sure to set your DATABASE_URL in .env
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
        console.log('Rooms fetched from DB:', res.rows); // Log rooms to see if we have any
        return res.rows.map(row => row.name); // Return room names
    } catch (error) {
        console.error('Error fetching rooms from DB:', error);
        return [];
    }
};

// Create new room in DB
const createRoomInDB = async (newRoom) => {
    try {
        // Check if the room already exists
        const checkRes = await client.query('SELECT * FROM rooms WHERE name = $1', [newRoom]);
        if (checkRes.rows.length > 0) {
            console.log('Room already exists');
            return null;
        }

        // Insert the new room
        const res = await client.query(
            'INSERT INTO rooms (name) VALUES ($1) RETURNING *',
            [newRoom]
        );
        console.log('Created room:', res.rows[0]);
        return res.rows[0];
    } catch (error) {
        console.error('Error creating room in DB:', error);
        return null;
    }
};

// Save message to the database
const saveMessageToDatabase = async (room, message, sender) => {
    try {
        const res = await client.query(
            'INSERT INTO messages (room_name, message, sender) VALUES ($1, $2, $3) RETURNING *',
            [room, message, sender]
        );
        console.log('Message saved to DB:', res.rows[0]);
    } catch (error) {
        console.error('Error saving message to DB:', error);
    }
};

// Fetch message history from DB
const getMessagesFromDB = async (room) => {
    try {
        const res = await client.query(
            'SELECT sender, message FROM messages WHERE room_name = $1 ORDER BY created_at ASC',
            [room]
        );
        return res.rows;
    } catch (error) {
        console.error('Error fetching messages from DB:', error);
        return [];
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

    io.on("connection", (socket) => {
        console.log(`${socket.id} has connected`);

 // Handle createRoom event
        socket.on("createRoom", async (newRoom) => {
            const room = await createRoomInDB(newRoom);
            if (room) {
                io.emit("availableRooms", await getRoomsFromDB()); // Emit updated room list
            } else {
                console.log('Failed to create room');
            }
        });

//join room
        socket.on("join-room", async ({ room, userId }) => {
            console.log(`User with ID ${userId} is attempting to join room: ${room}`);

            // Fetch the username from the database using the userId
            const userRes = await client.query('SELECT user_name FROM users WHERE id = $1', [userId]);
            const username = userRes.rows[0]?.user_name;

            if (username) {
                console.log(`User ${username} joined room: ${room}`);
                socket.join(room);

                const roomRes = await client.query('SELECT id FROM rooms WHERE name = $1', [room]);
                const roomId = roomRes.rows[0]?.id;

                if (roomId) {
                    await client.query('INSERT INTO room_users (room_id, user_name) VALUES ($1, $2)', [roomId, username]);
                    console.log(`User ${username} added to room_users table`);

                    socket.to(room).emit("user_joined", `${username} joined the room`);

                    const messages = await getMessagesFromDB(room); // Assume this function is implemented to fetch messages
                    socket.emit("messageHistory", messages);
                }
            } else {
                console.log(`User with ID ${userId} not found`);
                socket.emit("error", "User not found in the database");
            }
        });
//deleting room
        socket.on("removeRoom", async (roomToRemove) => {
            console.log(`Attempting to remove room: ${roomToRemove}`);

            // Delete the room from the database
            try {
                const res = await client.query('DELETE FROM rooms WHERE name = $1', [roomToRemove]);
                console.log(`Room ${roomToRemove} deleted from DB`);

                // Emit the updated room list to all connected clients
                io.emit("availableRooms", await getRoomsFromDB());
            } catch (error) {
                console.error("Error deleting room:", error);
            }
        });
    //leave room
        socket.on("leave-room", async (room) => {
            console.log(`User left room: ${room}`);
            socket.leave(room);

            const roomRes = await client.query('SELECT id FROM rooms WHERE name = $1', [room]);
            const roomId = roomRes.rows[0]?.id;

            if (roomId) {
                await client.query('DELETE FROM room_users WHERE room_id = $1 AND user_name = $2', [roomId, socket.id]);
                console.log(`User removed from room_users table`);

                socket.to(room).emit("user_left", `${socket.id} left the room`);
            }
        });
       // Handle message event (sending messages in rooms)
        socket.on("message", async ({ room, message, sender }) => {
            console.log(`Received message in room ${room} from ${sender}: ${message}`);

            // Save the message to the database
            await saveMessageToDatabase(room, message, sender);

            // Broadcast the message to the room
            io.to(room).emit("message", { sender, message });
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
// import pkg from 'pg';
// const { Client } = pkg;


// const dev = process.env.NODE_ENV !== 'production';
// const hostname = process.env.HOSTNAME || 'localhost';
// const port = process.env.PORT || '3005';

// const client = new Client({
//     connectionString: process.env.DATABASE_URL,
// });

// client.connect().then(() => {
//     console.log('Connected to PostgreSQL database');
// }).catch((error) => {
//     console.error('Failed to connect to PostgreSQL:', error);
// });

// const app = next({ dev, hostname, port });
// const handle = app.getRequestHandler();

// const getRoomsFromDB = async () => {
//     try {
//         const res = await client.query('SELECT name FROM rooms');
//         return res.rows.map(row => row.name);
//     } catch (error) {
//         console.error('Error fetching rooms from DB:', error);
//         return [];
//     }
// };

// const createRoomInDB = async (newRoom) => {
//     try {
//         const checkRes = await client.query('SELECT * FROM rooms WHERE name = $1', [newRoom]);
//         if (checkRes.rows.length > 0) return null;

//         const res = await client.query('INSERT INTO rooms (name) VALUES ($1) RETURNING *', [newRoom]);
//         return res.rows[0];
//     } catch (error) {
//         console.error('Error creating room in DB:', error);
//         return null;
//     }
// };

// const getUsersInRoom = async (room) => {
//     try {
//         const roomRes = await client.query('SELECT id FROM rooms WHERE name = $1', [room]);
//         const roomId = roomRes.rows[0]?.id;

//         if (roomId) {
//             const usersRes = await client.query('SELECT user_name FROM room_users WHERE room_id = $1', [roomId]);
//             return usersRes.rows.map(row => row.user_name);
//         }
//         return [];
//     } catch (error) {
//         console.error('Error fetching users from room_users table:', error);
//         return [];
//     }
// };

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

//         socket.on("join-room", async ({ room, username }) => {
//             console.log(`User ${username} joined room: ${room}`);
//             socket.join(room);

//             const roomRes = await client.query('SELECT id FROM rooms WHERE name = $1', [room]);
//             const roomId = roomRes.rows[0]?.id;

//             if (roomId) {
//                 await client.query('INSERT INTO room_users (room_id, user_name) VALUES ($1, $2)', [roomId, username]);
//                 console.log(`User ${username} added to room_users table`);
//                 socket.to(room).emit("user_joined", `${username} joined the room`);

//                 const messages = await getMessagesFromDB(room);
//                 socket.emit("messageHistory", messages);
//             }
//         });

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

//         socket.on("createRoom", async (newRoom) => {
//             const room = await createRoomInDB(newRoom);
//             if (room) {
//                 io.emit("availableRooms", await getRoomsFromDB());
//             }
//         });
//     });
      
//     socket.on("get-users-in-room", async (room) => {
//         const users = await getUsersInRoom(room);
//         socket.emit("users-in-room", users); // Send back the list of users
//     });
    
//     httpServer.listen(port, '0.0.0.0', () => {
//         console.log(`Server is listening on http://${hostname}:${port}`);
//     });
// }).catch((err) => {
//     console.error('Error preparing Next.js app:', err);
// });
