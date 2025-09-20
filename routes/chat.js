// backend/routes/chat.js - CORREGIR LÓGICA DE SALAS

const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get ALL public chat rooms + user's private rooms
router.get('/rooms', authenticateToken, async (req, res) => {
  try {
    // Obtener salas públicas + salas privadas donde el usuario es miembro
    const result = await db.query(`
      SELECT DISTINCT cr.id, cr.name, cr.description, cr.is_private, cr.created_at,
             CASE WHEN rm.user_id IS NOT NULL THEN true ELSE false END as is_member
      FROM chat_rooms cr
      LEFT JOIN room_members rm ON cr.id = rm.room_id AND rm.user_id = $1
      WHERE cr.is_private = false OR rm.user_id = $1
      ORDER BY cr.created_at DESC
    `, [req.user.id]);
    
    console.log(`User ${req.user.id} fetched ${result.rows.length} rooms`);
    res.json(result.rows);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages for a room (solo si el usuario es miembro O la sala es pública)
router.get('/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    // Verificar si el usuario puede acceder a la sala
    const accessCheck = await db.query(`
      SELECT cr.is_private, rm.user_id as is_member
      FROM chat_rooms cr
      LEFT JOIN room_members rm ON cr.id = rm.room_id AND rm.user_id = $2
      WHERE cr.id = $1
    `, [roomId, req.user.id]);
    
    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const room = accessCheck.rows[0];
    
    // Si es sala privada, debe ser miembro
    if (room.is_private && !room.is_member) {
      return res.status(403).json({ error: 'Access denied to private room' });
    }
    
    // Si es sala pública, unir automáticamente al usuario
    if (!room.is_private && !room.is_member) {
      await db.query(
        'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
        [roomId, req.user.id]
      );
      console.log(`User ${req.user.id} auto-joined public room ${roomId}`);
    }
    
    const result = await db.query(`
      SELECT m.id, m.message, m.message_type, m.created_at,
             u.id as sender_id, u.username as sender_name, u.avatar_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.room_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [roomId, limit, offset]);
    
    console.log(`Fetched ${result.rows.length} messages for room ${roomId}`);
    res.json(result.rows.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new room (públicas por defecto)
router.post('/rooms', authenticateToken, async (req, res) => {
  try {
    const { name, description, isPrivate = false } = req.body;
    
    console.log(`Creating room: ${name}, private: ${isPrivate}`);
    
    // Crear sala
    const roomResult = await db.query(
      'INSERT INTO chat_rooms (name, description, is_private, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, isPrivate, req.user.id]
    );
    
    const room = roomResult.rows[0];
    
    // Agregar creador como miembro
    await db.query(
      'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)',
      [room.id, req.user.id]
    );
    
    console.log(`Room created: ${room.name} (ID: ${room.id}), private: ${room.is_private}`);
    res.status(201).json(room);
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join a room manualmente (para salas públicas)
router.post('/rooms/:roomId/join', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Verificar que la sala existe y no es privada
    const roomResult = await db.query(
      'SELECT id, is_private, name FROM chat_rooms WHERE id = $1',
      [roomId]
    );
    
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const room = roomResult.rows[0];
    
    if (room.is_private) {
      return res.status(403).json({ error: 'Cannot join private room' });
    }
    
    // Agregar usuario a la sala (ignorar si ya es miembro)
    await db.query(
      'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
      [roomId, req.user.id]
    );
    
    console.log(`User ${req.user.id} joined room ${roomId} (${room.name})`);
    res.json({ message: 'Joined room successfully', room: room });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Obtener lista de todos los usuarios (para testing)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, last_seen FROM users ORDER BY username'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;