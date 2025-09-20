// backend/server.js - CORREGIR WEBSOCKETS Y MENSAJES

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
    origin: "*",
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
  console.log(`✅ User connected: ${socket.userId} (${socket.userName})`);
  
  // Join user to their personal room
  socket.join(`user_${socket.userId}`);
  
  // Join chat room
  socket.on('join_room', (roomId) => {
    socket.join(`room_${roomId}`);
    console.log(`🏠 User ${socket.userName} (${socket.userId}) joined room ${roomId}`);
    
    // Notificar a otros usuarios en la sala
    socket.to(`room_${roomId}`).emit('user_joined', {
      userId: socket.userId,
      userName: socket.userName,
      message: `${socket.userName} se unió a la sala`
    });
  });
  
  // Handle new message
  socket.on('send_message', async (data) => {
    try {
      console.log(`📤 Message received from ${socket.userName}:`, data);
      
      const { roomId, message, messageType = 'text' } = data;
      
      if (!roomId || !message) {
        console.log('❌ Invalid message data:', data);
        socket.emit('error', { message: 'Invalid message data' });
        return;
      }
      
      // Save message to database
      const savedMessage = await saveMessage({
        senderId: socket.userId,
        roomId,
        message,
        messageType
      });
      
      console.log(`💾 Message saved to DB:`, savedMessage);
      
      // Prepare message for broadcast
      const messageForBroadcast = {
        id: savedMessage.id,
        senderId: socket.userId,
        senderName: socket.userName,
        message,
        messageType,
        timestamp: savedMessage.created_at,
        roomId: parseInt(roomId),
        avatarUrl: null
      };
      
      console.log(`📡 Broadcasting message to room_${roomId}:`, messageForBroadcast);
      
      // Emit to ALL users in the room (including sender)
      io.to(`room_${roomId}`).emit('new_message', messageForBroadcast);
      
      console.log(`✅ Message broadcasted successfully`);
      
    } catch (error) {
      console.error('❌ Send message error:', error);
      socket.emit('error', { message: 'Failed to send message', error: error.message });
    }
  });
  
  // Handle typing indicators
  socket.on('typing_start', (roomId) => {
    console.log(`⌨️ ${socket.userName} started typing in room ${roomId}`);
    socket.to(`room_${roomId}`).emit('user_typing', {
      userId: socket.userId,
      userName: socket.userName,
      roomId
    });
  });
  
  socket.on('typing_stop', (roomId) => {
    console.log(`⌨️ ${socket.userName} stopped typing in room ${roomId}`);
    socket.to(`room_${roomId}`).emit('user_stopped_typing', {
      userId: socket.userId,
      userName: socket.userName,
      roomId
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`❌ User disconnected: ${socket.userName} (${socket.userId}) - Reason: ${reason}`);
  });
  
  // Handle error
  socket.on('error', (error) => {
    console.log(`❌ Socket error for user ${socket.userName}:`, error);
  });
});

// Error handling for Socket.IO
io.engine.on("connection_error", (err) => {
  console.log('❌ Socket.IO connection error:', err.req);
  console.log('❌ Socket.IO error code:', err.code);
  console.log('❌ Socket.IO error message:', err.message);
  console.log('❌ Socket.IO error context:', err.context);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Socket.IO server ready`);
  initDatabase();
});