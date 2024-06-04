const express = require('express');
const path = require('path');
const router = express.Router();

// import isAuthenticated from '../app.js';

//klient requestuje '/' <- req, a serwer daje response w postaci sendFile res -> sendFile(...)
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'index.html'));
});

router.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'index.html'));
});

router.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'login.html'));
});

router.get('/main.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'main.html'));
});

router.get('/profil.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'profil.html'));
});

module.exports = router;