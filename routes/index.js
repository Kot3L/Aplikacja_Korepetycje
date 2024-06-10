const express = require('express');
const path = require('path');
const router = express.Router();

// import isAuthenticated from '../app.js';

//klient requestuje '/' <- req, a serwer daje response w postaci sendFile res -> sendFile(...)
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'register.html'));
});

router.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'register.html'));
});

module.exports = router;