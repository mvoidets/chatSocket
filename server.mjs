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

    socket.on('disconnect', () => console.log('Player disconnected'));
});


httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://${hostname}:${port}`);

}).catch((err) => {
console.error('Error preparing Next.js app:', err);
});
