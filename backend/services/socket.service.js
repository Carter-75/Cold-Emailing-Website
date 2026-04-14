const { Server } = require('socket.io');

let io;
let activeConnections = new Set();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    activeConnections.add(socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      activeConnections.delete(socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

const hasActiveDashboard = () => activeConnections.size > 0;

const emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

module.exports = { initSocket, getIO, emitToAll, hasActiveDashboard };
