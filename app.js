const express = require('express');
const Fuse = require('fuse.js');
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cnctionString = require('./cnctionString.js');
const port = 3000;
const routes = require('./routes/index');

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session middleware
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    maxAge: null // Cookie expires when the browser is closed
  }
}));

// Middleware to initialize nrOfTries if not present
app.use((req, res, next) => {
  if (!req.session.nrOfTries) {
    req.session.nrOfTries = 0;
  }
  next();
});

// Parse JSON and url-encoded query
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', routes);

// MongoDB connection
app.use(bodyParser.urlencoded({ extended: true }));
mongoose.connect(cnctionString, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

// Define a schema and model
const UserSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  password: String,
  pfpPath: String
});
const UserModel = mongoose.model('User', UserSchema);

const TutoringSchema = new mongoose.Schema({
  authorsPfpPath: String,
  authorsFirstName: String,
  authorsLastName: String,
  authorsEmail: String,
  subject: String,
  unit: String,
  topic: String,
  description: String
});
const TutoringModel = mongoose.model('Tutoring', TutoringSchema);

// Register route
app.post('/register-form', async (req, res) => {
  try {
    const existingData = await UserModel.findOne({ email: req.body.email });
    if (existingData) {
      return res.status(400).send('Data with this email already exists.');
    } else {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const userData = new UserModel({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: hashedPassword,
        pfpPath: 'img/pfp/default.png'
      });
      await userData.save();
      return res.redirect('/login.html');
    }
  } catch (err) {
    console.error('Failed to save form data:', err);
    return res.status(500).send('Failed to save form data');
  }
});

// Login route
app.post('/login-form', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await UserModel.findOne({ email });
    if (user) {
      const match = await bcrypt.compare(req.body.password, user.password);
      if (match) {
        req.session.user = user;
        return res.redirect('/index.html');
      } else {
        req.session.nrOfTries = (req.session.nrOfTries || 0) + 1;
        if (req.session.nrOfTries == 4) {
          req.session.isAuthenticated = true;
          return res.send(`
            <html>
            <head>
              <script>
                alert("To na pewno ty?");
                window.location.href = '/register.html';
              </script>
            </head>
            <body></body>
            </html>
          `);
        }
        return res.send(`
          <html>
          <head>
            <script>
              alert("Podano zle haslo");
              window.location.href = '/login.html';
            </script>
          </head>
          <body></body>
        </html>
        `);
      }
    } else {
      return res.send(`
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
    return res.status(500).send('Server error');
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/profil.html');
    }
    res.clearCookie('connect.sid');
    return res.redirect('/login.html');
  });
});

// Add tutoring route
app.post('/add-tutoring-form', async (req, res) => {
  try {
    const description = req.body.description.trim() === '' ? 'Brak' : req.body.description;

    const tutoringData = new TutoringModel({
      authorsPfpPath: req.session.user.pfpPath,
      authorsFirstName: req.session.user.firstName,
      authorsLastName: req.session.user.lastName,
      authorsEmail: req.session.user.email,
      subject: req.body.subject,
      unit: req.body.unit,
      topic: req.body.topic,
      description: description
    });
    await tutoringData.save();
    return res.redirect('/dodaj_zgloszenie.html');
  } catch (err) {
    console.error('Failed to save form data:', err);
    return res.status(500).send('Failed to save form data');
  }
});

// Search tutoring route
app.post('/search-tutoring-form', isAuthenticated, async (req, res) => {
  const { authorsFirstName, authorsLastName, subject, unit, topic } = req.body;

  try {
    let tutorings = await TutoringModel.find({});
    const searchCriteria = [
      { key: 'authorsFirstName', value: authorsFirstName },
      { key: 'authorsLastName', value: authorsLastName },
      { key: 'subject', value: subject !== 'all' ? subject : null },
      { key: 'unit', value: unit },
      { key: 'topic', value: topic }
    ];
    const filteredCriteria = searchCriteria.filter(criteria => criteria.value);
    if (filteredCriteria.length > 0) {
      const options = {
        keys: filteredCriteria.map(criteria => criteria.key),
        threshold: 0.4,
        distance: 100,
      };
      const fuse = new Fuse(tutorings, options);
      let results = tutorings;
      filteredCriteria.forEach(criteria => {
        const fuse = new Fuse(results, { keys: [criteria.key], threshold: 0.4, distance: 100 });
        results = fuse.search(criteria.value).map(result => result.item);
      });
      tutorings = results;
    }
    return res.render('wyniki', { items: tutorings });
  } catch (err) {
    console.error('Failed to retrieve tutorings:', err);
    return res.status(500).send('Failed to retrieve tutorings');
  }
});

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  } else {
    return res.redirect('/login.html');
  }
}

// Middleware to check if authentication is required
const checkAuthRequired = (req, res, next) => {
  if (req.session.nrOfTries >= 4) {
    return isAuthenticated(req, res, next);
  }
  next();
};

// Route to get the session variables
app.get('/get-session', (req, res) => {
  const nrOfTries = req.session.nrOfTries;
});

// View routes
app.get('/login.html', checkAuthRequired, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/zgloszenia.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'zgloszenia.html'));
});

app.get('/dodaj_zgloszenie.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dodaj_zgloszenie.html'));
});

app.get('/index.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/kalendarz.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'kalendarz.html'));
});

app.get('/profil.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'profil.html'));
});

// Server responses section
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

// Handle server errors
app.on('error', (error) => {
  console.error('Server error:', error);
});

// Gracefully shut down the server on SIGINT (Ctrl+C) or SIGTERM (termination signal)
process.on('SIGINT', () => {
  app.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  app.close(() => {
    process.exit(0);
  });
});

// Handle 404 errors
app.use((req, res, next) => {
  res.status(404).send('Sorry, that route does not exist.');
});

// Handle other errors
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (!res.headersSent) {
    res.status(500).send('Something went wrong!');
  }
});
