import { Server as ServerIO } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';
import { createServer } from 'http';

const SocketHandler = (req: NextApiRequest, res: NextApiResponse) => {
  if (res.socket && (res.socket as any).server.io) {
    console.log('Socket is already running');
  } else {
    console.log('Socket is initializing');
    const httpServer = createServer();
    const io = new ServerIO(httpServer, {
      path: '/api/socket',
      cors: {
        origin: '*', // Adjust this for your production environment
      },
    });

    io.on('connection', (socket) => {
      console.log('A client connected');

      socket.on('disconnect', () => {
        console.log('A client disconnected');
      });
    });

    (res.socket as any).server.io = io;
  }
  res.end();
};

export default SocketHandler;