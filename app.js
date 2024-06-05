const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cnctionString = require('./cnctionString.js');

const port = 3000;
const routes = require('./routes/index') 

// Session middleware //

// Use express-session middleware
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    maxAge: null // Cookie expires when the browser is closed
  }
}));

// Parse JSON and url-encoded query
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', routes);


// MongoDB section //

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect(cnctionString, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

// Define a schema and model
const UserSchema = new mongoose.Schema({
  email: String,
  password: String
});
const UserModel = mongoose.model('User', UserSchema);

const TutoringSchema = new mongoose.Schema({
  authorsEmail: String,
  subject: String,
  chapter: String,
  thema: String,
  description: String
});
const TutoringModel = mongoose.model('Tutoring', TutoringSchema);

// Register section
app.post('/register-form', async (req, res) => {
  console.log('Form data received:', req.body);
  // Check for existing data with the same email
  try {
    const existingData = await UserModel.findOne({ email: req.body.email });
    if (existingData) {
      // If a match is found, send an appropriate response
      res.status(400).send('Data with this email already exists.');
    } else {
      // Hash the password before saving the new data
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const userData = new UserModel({
        email: req.body.email,
        password: hashedPassword
      });
      await userData.save();
      res.redirect('/login.html'); // Redirect with query parameter
    }
  } catch (err) {
    console.error('Failed to save form data:', err);
    res.status(500).send('Failed to save form data');
  }
});

// Login section
app.post('/login-form', async (req, res) =>{
  const { email, password } = req.body;
  try {
    const user = await UserModel.findOne({ email });
    if (user) {
      const match = await bcrypt.compare(req.body.password, user.password);
      if (match) {
        // Set up session
        req.session.user = email;
        res.redirect('/glowna.html');
      }else{
        res.send(`
        <html>
        <head>
          <script>
            alert("Podano zle haslo");
            window.location.href = '/login.html';
          </script>
        </head>
        <body></body>
      </html>
        `)
      }
    } else {
      res.send(`        
      <html>
      <head>
        <script>
          alert("Podano zlego emaila");
          window.location.href = '/login.html';
        </script>
      </head>
      <body></body>
    </html>`);
      }
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Add tutoring section
app.post('/add-tutoring-form', async (req, res) => {
  console.log('Form data received:', req.body);
  try {
    const tutoringData = new TutoringModel({
      authorsEmail: req.session.user,
      subject: req.body.subject,
      chapter: req.body.chapter,
      thema: req.body.thema,
      description: req.body.description
    });
    await tutoringData.save();
    res.redirect('/add_korepetycje.html'); // Redirect with query parameter
  } catch (err) {
    console.error('Failed to save form data:', err);
    res.status(500).send('Failed to save form data');
  }
});

function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login.html');
  }
}

app.get('/add_korepetycje.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'add_korepetycje.html'));
});

app.get('/glowna.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'glowna.html'));
});

app.get('/profil.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'profil.html'));
});

// Server responses section
app.listen(port, () => {
  console.log(`Serwer działa pod adresem http://localhost:${port}`);
});

// Handle server errors
app.on('error', (error) => {
  console.error('Server error:', error);
});

// Gracefully shut down the server on SIGINT (Ctrl+C) or SIGTERM (termination signal)
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  app.close(() => {
    console.log('Server has stopped');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down gracefully...');
  app.close(() => {
    console.log('Server has stopped');
    process.exit(0);
  });
});

// Server section end //

// Obsługa błędu 404
app.use((req, res, next) => {
  res.status(404).send('Przepraszamy, taka trasa nie istnieje.');
});
  
// Obsługa błędów
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Coś poszło nie tak!');
});