const express = require('express');
const session = require('express-session');
require('dotenv').config();
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cnctionString = process.env.DATABASE_CONNECTION;
const routes = require('./routes/index');
const bcrypt = require('bcrypt');
const Fuse = require('fuse.js');
const nodemailer = require('nodemailer');
const ePass = process.env.APP_PASSWORD;
const User = require('./models/User');
const multer = require('multer');
const cron = require('node-cron');
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
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Adjust the timeout here
  socketTimeoutMS: 45000 // Adjust the socket timeout here
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

// Define a schema and model
// const UserSchema = new mongoose.Schema({
//   firstName: String,
//   lastName: String,
//   email: String,
//   password: String,
//   pfpPath: String,
//   rating: Number
// });

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

const ReviewSchema = new mongoose.Schema({
  author: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: Number,
  description: String,
  tutor: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, { timestamps: true });
const ReviewModel = mongoose.model('Review', ReviewSchema);

// Scheduled task to update tutoring statuses
cron.schedule('0 0 * * *', async () => {
  try {
    const now = new Date();
    await TutoringModel.updateMany(
      { date: { $lt: now }, status: 'scheduled' },
      { status: 'completed' }
    );
  } catch (err) {
    console.error('Failed to update tutoring sessions:', err);
  }
});

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
      user: 'zstikorepetycje@gmail.com',
      pass: ePass // Replace with your actual password or use environment variables
  }
});

// Route for registration form submission
app.post('/register-form', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body; 

        // Check if the email is already registered
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.send(`
            <html>
            <head>
              <script>
                alert("Podany email jest juz zarejestrowany");
                window.location.href = '/register.html';
              </script>
            </head>
            <body></body>
            </html>
          `);;
        }

        if(password.length < 6){
          return res.send(`
            <html>
            <head>
              <script>
                alert("Podane haslo musi miec co najmniej 6 znakow!");
                window.location.href = '/register.html';
              </script>
            </head>
            <body></body>
            </html>
          `);;
        }
    // Generate a 6-digit random code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); 

    // Save the code and user info in session
    req.session.verificationCode = verificationCode; 
    req.session.userData = { firstName, lastName, email, password }; 
    req.session.verificationCodeExpires = Date.now() + 120000; // Set expiration time for 2 minutes

    // Send verification email
    const mailOptions = {
      from: 'zstikorepetycje@gmail.com',
      to: email,
      subject: 'Verification Code',
      text: `Your verification code is: ${verificationCode}` 
    };

    transporter.sendMail(mailOptions, (error, info) => { 
      if (error) {
        console.error('Error sending email:', error); // Log the error details 
        return res.status(500).send('Error sending email');
      }
      // Redirect to verification page
      res.redirect('/weryfikacja.html'); 
    });
  } catch (err) {
    console.error('Error in /register route:', err);
    res.status(500).send('Something went wrong!');
  }
});

// Route to display verification form
app.get('/weryfikacja.html', (req, res) => { 
  try {
    res.sendFile(path.join(__dirname, 'views', 'weryfikacja.html')); // Correct path to weryfikacja.html 
  } catch (err) {
    console.error('Error in /weryfikacja.html route:', err);
    res.status(500).send('Something went wrong!');
  }
});

// Route for verification form submission
app.post('/weryfikacja', async (req, res) => {
  try {
    const { code } = req.body;
    const { verificationCode, userData, verificationCodeExpires } = req.session;

    if (!verificationCode || !userData) {
      return res.status(400).send('Session data missing. Please try registering again.');
    }

    if (Date.now() > verificationCodeExpires) {
      return res.status(400).send('Verification code expired');
    }

    if (code === verificationCode) {
      // Save user to the database
      const newUser = new User(userData); // Correct usage of User model 
      await newUser.save();

      // Clear session data
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err); 
        }
      });

      // Redirect to login page
      res.redirect('/login.html'); 
    } else {
      res.status(400).send('Invalid verification code');
    }
  } catch (err) {
    console.error('Error in /weryfikacja route:', err);
    res.status(500).send('Something went wrong!');
  }
});

// Route for password reset initiation
app.post('/zapomnialem-hasla', async (req, res) => {
  try {
    const { email } = req.body;

    // Check if the email exists in the database
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).send('Email not found');
    }

    // Generate a verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.verificationCode = verificationCode;
    req.session.verificationCodeExpires = Date.now() + 120000; // Set expiration time for 2 minutes
    req.session.email = email; // Save email in session

    // Send verification email
    const mailOptions = {
      from: 'zstikorepetycje@gmail.com',
      to: email,
      subject: 'Verification Code for Password Reset',
      text: `Your verification code is: ${verificationCode}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        return res.status(500).send('Error sending email');
      }
      // Redirect to password verification page
      res.redirect('/weryfikacjahasla.html');
    });
  } catch (err) {
    console.error('Error in /zapomnialem-hasla route:', err);
    res.status(500).send('Something went wrong!');
  }
});

app.get('/weryfikacjahasla.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'weryfikacjahasla.html'));
});


// Route for password reset verification form submission
app.post('/weryfikacjahasla', async (req, res) => {
  try {
    const { code } = req.body;
    const { verificationCode, verificationCodeExpires } = req.session;

    if (!verificationCode) {
      return res.status(400).send('Verification code missing. Please try again.');
    }

    if (Date.now() > verificationCodeExpires) {
      return res.status(400).send('Verification code expired');
    }

    if (code === verificationCode) {
      // Redirect to password change page
      res.redirect('/zmianahasla.html');
    } else {
      res.status(400).send('Invalid verification code');
    }
  } catch (err) {
    console.error('Error in /weryfikacjahasla route:', err);
    res.status(500).send('Something went wrong!');
  }
});

app.get('/zmianahasla.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'zmianahasla.html'));
});

// Route for password change form submission
app.post('/zmiana-hasla', async (req, res) => {
  try {
    const { newPassword } = req.body;
    const { email } = req.session;

    if (!email) {
      return res.status(400).send('Email missing from session. Please try again.');
    }

    if (newPassword.length < 6) {
      return res.status(400).send('Password must be at least 6 characters long');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password in the database
    await User.findOneAndUpdate({ email }, { password: hashedPassword });

    // Clear session data
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
      }
    });

    // Redirect to login page
    res.redirect('/login.html');
  } catch (err) {
    console.error('Error in /zmiana-hasla route:', err);
    res.status(500).send('Something went wrong!');
  }
});

// Login route
app.post('/login-form', async (req, res) => { 
  const { email, password } = req.body; 
  try {
    const user = await User.findOne({ email }); 
    if (user) {
      const match = await bcrypt.compare(password, user.password); 
      if (match) {
        req.session.user = { 
          ...user.toObject(),
          unhashedPassword: password 
        };
        return res.redirect('/index.html'); 
      } else {
        req.session.nrOfTries = (req.session.nrOfTries || 0) + 1; 
        if (req.session.nrOfTries == 4) { 
          // Generate a verification code
          const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
          req.session.verificationCode = verificationCode;
          req.session.verificationCodeExpires = Date.now() + 120000; // Set expiration time for 2 minutes
          req.session.email = email; // Save email in session

          // Send verification email
          const mailOptions = {
            from: 'zstikorepetycje@gmail.com',
            to: email,
            subject: 'Verification Code for Password Reset',
            text: `Your verification code is: ${verificationCode}`
          };

          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error('Error sending email:', error);
              return res.status(500).send('Error sending email');
            }
            // Save session before redirecting
            req.session.save((err) => {
              if (err) {
                console.error('Error saving session:', err);
                return res.status(500).send('Error saving session');
              }
              // Redirect to password verification page

            });
          });
          return res.redirect('/weryfikacjahasla.html');
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
    console.error('Error in /login-form route:', err); 
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

// Review tutoring route
app.post('/review-tutoring-form', isAuthenticated, async (req, res) => {
  try {
    const { rating, description, tutoringId, tutorId } = req.body;
    const userId = req.session.user._id;

    const reviewData = new ReviewModel({
      author: userId,
      rating: parseInt(rating, 10),
      description: description || 'Brak',
      tutor: tutorId
    });

    await reviewData.save();
    await TutoringModel.findByIdAndDelete(tutoringId);

    const reviews = await ReviewModel.find({ tutor: tutorId });
    let averageRating = 0;
    if (reviews.length > 0) {
      const totalRating = reviews.reduce((acc, review) => acc + review.rating, 0);
      averageRating = Math.round(totalRating / reviews.length);
    }
    await UserModel.findByIdAndUpdate(tutorId, { rating: averageRating });

    res.redirect('/index.html');
  } catch (err) {
    console.error('Failed to save review data:', err);
    res.status(500).send('Failed to save review data');
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


// Profile update route
app.post('/profile-form', isAuthenticated, upload.single('pfp'), async (req, res) => { 
  try {
    const userId = req.session.user._id; 
    const { firstName, lastName, email, password } = req.body; 

    const user = await User.findById(userId); 

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

// Profile route
app.get('/profil.html', isAuthenticated, async (req, res) => { 
  try {
    const userId = req.session.user._id; 
    const user = await User.findById(userId); 
    if (!user) { 
      throw new Error('User not found'); 
    }

    res.render('profil', { user, unhashedPassword: req.session.user.unhashedPassword }); 
  } catch (err) {
    console.error('Failed to retrieve profile data:', err); 
    res.status(500).send('Failed to retrieve profile data'); 
  }
});

app.get('/opinie.html', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const reviews = await ReviewModel.find({ tutor: userId }).populate('author').sort({ createdAt: -1 }); // Sorting by createdAt in descending order
    res.render('opinie', { reviews });
  } catch (err) {
    console.error('Failed to retrieve reviews:', err);
    res.status(500).send('Failed to retrieve reviews');
  }
});

app.get('/index.html', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user._id;

    let userTutorings = await TutoringModel.find({ author: userId }).populate('author').populate('tutor');
    let userCourses = await TutoringModel.find({ tutor: userId, status: { $ne: 'completed' } }).populate('author').populate('tutor');

    // Function to sort tutorings by date and status
    const sortTutorings = (tutorings) => {
      // Separate the tutorings with and without dates
      const withDates = tutorings.filter(tutoring => tutoring.date);
      const withoutDates = tutorings.filter(tutoring => !tutoring.date);

      // Sort tutorings with dates by date
      withDates.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Sort by status within the date-sorted tutorings
      const statusOrder = { 'scheduled': 1, 'accepted': 2, 'pending': 3 };
      withDates.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

      // Combine the sorted arrays
      return [...withDates, ...withoutDates];
    };

    // Sort both userTutorings and userCourses
    userTutorings = sortTutorings(userTutorings);
    userCourses = sortTutorings(userCourses);

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
