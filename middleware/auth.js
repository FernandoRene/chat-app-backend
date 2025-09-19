const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user info from database
    const result = await db.query('SELECT id, username FROM users WHERE id = $1', [decoded.id]);
    
    if (result.rows.length === 0) {
      return next(new Error('User not found'));
    }
    
    socket.userId = decoded.id;
    socket.userName = result.rows[0].username;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
}

module.exports = {
  authenticateToken,
  authenticateSocket,
  JWT_SECRET
};