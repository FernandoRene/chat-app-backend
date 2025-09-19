const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const { authenticateSocket } = require('./middleware/auth');
const { initDatabase, saveMessage } = require('./config/database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // En producción especificar dominios
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Chat API is running!' });
});

app.get('/api', (req, res) => {
  res.json({ message: 'Chat API endpoints are working!' });
});

// Socket.io connection handling
io.use(authenticateSocket);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId}`);
  
  // Join user to their personal room
  socket.join(`user_${socket.userId}`);
  
  // Join chat room
  socket.on('join_room', (roomId) => {
    socket.join(`room_${roomId}`);
    console.log(`User ${socket.userId} joined room ${roomId}`);
  });
  
  // Handle new message
  socket.on('send_message', async (data) => {
    try {
      const { roomId, message, messageType = 'text' } = data;
      
      // Save message to database
      const savedMessage = await saveMessage({
        senderId: socket.userId,
        roomId,
        message,
        messageType
      });
      
      // Emit to room
      io.to(`room_${roomId}`).emit('new_message', {
        id: savedMessage.id,
        senderId: socket.userId,
        senderName: socket.userName,
        message,
        messageType,
        timestamp: savedMessage.created_at,
        roomId
      });
      
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // Handle typing indicators
  socket.on('typing_start', (roomId) => {
    socket.to(`room_${roomId}`).emit('user_typing', {
      userId: socket.userId,
      userName: socket.userName
    });
  });
  
  socket.on('typing_stop', (roomId) => {
    socket.to(`room_${roomId}`).emit('user_stopped_typing', {
      userId: socket.userId
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initDatabase();
});