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
  unit: String,
  topic: String,
  description: String,
  rating: Number
});
const TutoringModel = mongoose.model('Tutoring', TutoringSchema);

// Register route
app.post('/register-form', async (req, res) => {
  console.log('Form data received:', req.body);
  try {
    const existingData = await UserModel.findOne({ email: req.body.email });
    if (existingData) {
      res.status(400).send('Data with this email already exists.');
    } else {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const userData = new UserModel({
        email: req.body.email,
        password: hashedPassword
      });
      await userData.save();
      res.redirect('/login.html');
    }
  } catch (err) {
    console.error('Failed to save form data:', err);
    res.status(500).send('Failed to save form data');
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
        req.session.user = email;
        res.redirect('/glowna.html');
      }else{
        req.session.nrOfTries = (req.session.nrOfTries || 0) + 1; // Initialize and increment nrOfTries
        console.log(req.session.nrOfTries);
        if(req.session.nrOfTries == 4){
          req.session.isAuthenticated = true;
          res.send(`
            <html>
            <head>
              <script>
                alert("To na pewno ty?");
                window.location.href = '/index.html';
              </script>
            </head>
            <body></body>
            </html>
          `);
          return; // Stop further execution
        }
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

// Add tutoring route
app.post('/add-tutoring-form', async (req, res) => {
  console.log('Form data received:', req.body);
  try {
    const tutoringData = new TutoringModel({
      authorsEmail: req.session.user,
      subject: req.body.subject,
      unit: req.body.unit,
      topic: req.body.topic,
      description: req.body.description,
      rating: 0
    });
    await tutoringData.save();
    res.redirect('/add_korepetycje.html');
  } catch (err) {
    console.error('Failed to save form data:', err);
    res.status(500).send('Failed to save form data');
  }
});

// Search tutoring route
app.post('/search-tutoring-form', isAuthenticated, async (req, res) => {
  const { user, subject, unit, topic } = req.body;

  try {
    // Fetch all tutorings from the database
    let tutorings = await TutoringModel.find({});

    // Combine search criteria into an array
    const searchCriteria = [
      { key: 'authorsEmail', value: user },
      { key: 'subject', value: subject },
      { key: 'unit', value: unit },
      { key: 'topic', value: topic }
    ];

    // Filter out empty search criteria
    const filteredCriteria = searchCriteria.filter(criteria => criteria.value);

    if (filteredCriteria.length > 0) {
      // Set up Fuse.js options
      const options = {
        keys: filteredCriteria.map(criteria => criteria.key),
        threshold: 0.4, // Adjust the threshold to your needs
        distance: 100, // Adjust the distance to your needs
      };

      // Initialize Fuse.js
      const fuse = new Fuse(tutorings, options);

      // Perform the search iteratively using each criterion
      let results = tutorings;
      filteredCriteria.forEach(criteria => {
        const fuse = new Fuse(results, { keys: [criteria.key], threshold: 0.4, distance: 100 });
        results = fuse.search(criteria.value).map(result => result.item);
      });

      // Update tutorings with the final results
      tutorings = results;
    }

    res.render('wyniki', { items: tutorings });
  } catch (err) {
    console.error('Failed to retrieve tutorings:', err);
    res.status(500).send('Failed to retrieve tutorings');
  }
});

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login.html');
  }
  if (req.session.isAuthenticated) {
    return next();
  } else {
    res.redirect('/login.html');
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
app.get('/login.html', checkAuthRequired, (req, res)=>{
  res.sendFile(path.join(__dirname, 'views', 'login.html'))
});

app.get('/korepetytorzy.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'korepetytorzy.html'));
});

app.get('/add_korepetycje.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'add_korepetycje.html'));
});

app.get('/glowna.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'glowna.html'));
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

// Handle 404 errors
app.use((req, res, next) => {
  res.status(404).send('Sorry, that route does not exist.');
});

// Handle other errors
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});
