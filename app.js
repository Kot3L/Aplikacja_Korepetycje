const express = require('express');
const session = require('express-session');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cnctionString = require('./cnctionString.js');
const routes = require('./routes/index');
const bcrypt = require('bcrypt');
const Fuse = require('fuse.js');
const multer = require('multer');
const fs = require('fs');
const port = 3000;

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
  author: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: String,
  unit: String,
  topic: String,
  description: String,
  status: String,
  tutor: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
    required: false
  },
  date: Date,
  dateRequester: String
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
        req.session.user = {
          ...user.toObject(),
          unhashedPassword: password
        };
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
    const tutoringData = new TutoringModel({
      author: req.session.user._id,
      subject: req.body.subject,
      unit: req.body.unit,
      topic: req.body.topic,
      description: req.body.description || 'Brak',
      status: 'pending',
      tutor: null,
      date: null,
      dateRequester: null
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
  try {
    const userId = req.session.user._id;
    let tutorings = await TutoringModel.find({ 
      author: { $ne: userId }, 
      status: 'pending' 
    }).populate('author').populate('tutor');

    const searchCriteria = [
      { key: 'author.firstName', value: req.body.firstName },
      { key: 'author.lastName', value: req.body.lastName },
      { key: 'subject', value: req.body.subject !== 'all' ? req.body.subject : null },
      { key: 'unit', value: req.body.unit },
      { key: 'topic', value: req.body.topic }
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

// Accept tutoring route
app.post('/accept-tutoring-form', isAuthenticated, async (req, res) => {
  try {
    const tutoringId = req.body.id;
    const userId = req.session.user._id;

    const tutoring = await TutoringModel.findByIdAndUpdate(
      tutoringId,
      { status: 'accepted', tutor: userId },
      { new: true }
    );

    if (tutoring) {
      res.redirect('/index.html');
    } else {
      res.status(404).send('Tutoring session not found or unauthorized.');
    }
  } catch (err) {
    console.error('Failed to update tutoring session status:', err);
    res.status(500).send('Failed to update tutoring session status');
  }
});

// Request date route
app.post('/request-date-form', isAuthenticated, async (req, res) => {
  try {
    const date = new Date(req.body.date);
    const tutoringId = req.body.id;
    const userId = req.session.user._id;

    const tutoring = await TutoringModel.findById(tutoringId);

    if (!tutoring) {
      return res.status(404).send('Tutoring session not found.');
    }

    let requesterRole = '';
    if (tutoring.author.equals(userId)) {
      requesterRole = 'author';
    } else if (tutoring.tutor.equals(userId)) {
      requesterRole = 'tutor';
    } else {
      return res.status(403).send('You are not authorized to make this request.');
    }

    tutoring.date = new Date(date);
    tutoring.dateRequester = requesterRole;

    await tutoring.save();
    res.redirect('/index.html');
  } catch (err) {
    console.error('Failed to update tutoring session date:', err);
    res.status(500).send('Failed to update tutoring session date');
  }
});

// Accept date route
app.post('/accept-date-form', isAuthenticated, async (req, res) => {
  try {
    const tutoringId = req.body.id;

    const tutoring = await TutoringModel.findByIdAndUpdate(
      tutoringId,
      { status: 'scheduled' },
      { new: true }
    );

    if (!tutoring) {
      return res.status(404).send('Tutoring session not found.');
    }

    await tutoring.save();
    res.redirect('/index.html');
  } catch (err) {
    console.error('Failed to update tutoring session date:', err);
    res.status(500).send('Failed to update tutoring session date');
  }
});

// Reject date route
app.post('/reject-date-form', isAuthenticated, async (req, res) => {
  try {
    const tutoringId = req.body.id;
    const tutoring = await TutoringModel.findById(tutoringId);

    if (!tutoring) {
      return res.status(404).send('Tutoring session not found.');
    }

    tutoring.date = null;
    tutoring.dateRequester = null;

    await tutoring.save();
    res.redirect('/index.html');
  } catch (err) {
    console.error('Failed to update tutoring session date:', err);
    res.status(500).send('Failed to update tutoring session date');
  }
});

// Configure Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/img/pfp');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Profile route
app.post('/profile-form', isAuthenticated, upload.single('pfp'), async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { firstName, lastName, email, password } = req.body;

    const user = await UserModel.findById(userId);

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    if (req.file) {
      if (user.pfpPath && user.pfpPath !== 'img/pfp/default.png') {
        const oldPfpPath = path.join(__dirname, 'public', user.pfpPath);
        fs.unlink(oldPfpPath, (err) => {
          if (err) {
            console.error('Failed to delete old profile picture:', err);
          }
        });
      }

      user.pfpPath = 'img/pfp/' + req.file.filename;
    }

    await user.save();

    req.session.user = {
      ...user.toObject(),
      unhashedPassword: password || req.session.user.unhashedPassword
    };

    res.redirect('/profil.html');
  } catch (err) {
    console.error('Failed to update profile:', err);
    res.status(500).send('Failed to update profile');
  }
});

// Reject tutoring route
app.post('/reject-tutoring-form', isAuthenticated, async (req, res) => {
  try {
    const tutoringId = req.body.id;

    const tutoring = await TutoringModel.findByIdAndUpdate(
      tutoringId,
      { status: 'pending', tutor: null, date: null, dateRequester: null },
      { new: true }
    );

    if (tutoring) {
      res.redirect('/index.html');
    } else {
      res.status(404).send('Tutoring session not found.');
    }
  } catch (err) {
    console.error('Failed to update tutoring session status:', err);
    res.status(500).send('Failed to update tutoring session status');
  }
});

// Delete tutoring route
app.post('/delete-tutoring-form', isAuthenticated, async (req, res) => {
  try {
    const tutoringId = req.body.id;
    const userId = req.session.user._id;

    const tutoring = await TutoringModel.findOneAndDelete({ _id: tutoringId, author: userId });
    
    if (tutoring) {
      res.redirect('/index.html');
    } else {
      res.status(404).send('Tutoring session not found or unauthorized.');
    }
  } catch (err) {
    console.error('Failed to delete tutoring session:', err);
    res.status(500).send('Failed to delete tutoring session');
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

app.get('/profil.html', isAuthenticated, (req, res) => {
  res.render('profil', { user: req.session.user });
});

app.get('/opinie.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'opinie.html'));
});

app.get('/index.html', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const userTutorings = await TutoringModel.find({ author: userId }).populate('author').populate('tutor');
    const userCourses = await TutoringModel.find({ tutor: userId }).populate('author').populate('tutor');
    res.render('index', { userTutorings, userCourses });
  } catch (err) {
    console.error('Failed to retrieve user-specific tutorings and courses:', err);
    res.status(500).send('Failed to retrieve user-specific tutorings and courses');
  }
});

app.get('/dodaj_zgloszenie.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dodaj_zgloszenie.html'));
});

app.get('/zgloszenia.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'zgloszenia.html'));
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
