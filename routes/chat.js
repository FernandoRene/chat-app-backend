const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's chat rooms
router.get('/rooms', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT cr.id, cr.name, cr.description, cr.is_private, cr.created_at
      FROM chat_rooms cr
      JOIN room_members rm ON cr.id = rm.room_id
      WHERE rm.user_id = $1
      ORDER BY cr.created_at DESC
    `, [req.user.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages for a room
router.get('/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    // Check if user is member of the room
    const memberCheck = await db.query(
      'SELECT id FROM room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, req.user.id]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
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
    
    res.json(result.rows.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new room
router.post('/rooms', authenticateToken, async (req, res) => {
  try {
    const { name, description, isPrivate = false } = req.body;
    
    // Create room
    const roomResult = await db.query(
      'INSERT INTO chat_rooms (name, description, is_private, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, isPrivate, req.user.id]
    );
    
    const room = roomResult.rows[0];
    
    // Add creator as member
    await db.query(
      'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)',
      [room.id, req.user.id]
    );
    
    res.status(201).json(room);
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join a room
router.post('/rooms/:roomId/join', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Check if room exists and is not private
    const roomResult = await db.query(
      'SELECT id, is_private FROM chat_rooms WHERE id = $1',
      [roomId]
    );
    
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    if (roomResult.rows[0].is_private) {
      return res.status(403).json({ error: 'Cannot join private room' });
    }
    
    // Add user to room (ignore if already member)
    await db.query(
      'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
      [roomId, req.user.id]
    );
    
    res.json({ message: 'Joined room successfully' });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;