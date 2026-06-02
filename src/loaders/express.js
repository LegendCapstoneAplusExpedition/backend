const express = require('express');
const path = require('path');
const authRoutes = require('../routes/auth');
const broadcastRoutes = require('../routes/broadcast');
const userRoutes = require('../routes/user');
const aiRoutes = require('../routes/ai');
const postRoutes = require('../routes/post');
const swaggerLoader = require('./swagger');

module.exports = (app) => {
  // Middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-auth-token');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  app.use(express.json());
  app.use(express.static('public'));

  // Swagger
  swaggerLoader(app);

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/broadcast', broadcastRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/broadcast', aiRoutes); // /api/broadcast/:id/ai/... 로 연결
  app.use('/api/posts', postRoutes);

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'index.html'));
  });

  // Error handling middleware can be added here
};
