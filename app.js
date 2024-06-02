const express = require('express');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cnctionString = require('./cnctionString.js');

const port = 3000;
const routes = require('./routes/index')





app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);


//MongoDB section///
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
const FormSchema = new mongoose.Schema({
  email: String,
  password: String
});
const FormModel = mongoose.model('Form', FormSchema);

app.post('/submit-form', async (req, res) => {
  console.log('Form data received:', req.body);
  
  // Check for existing data with the same email
  try {
    const existingData = await FormModel.findOne({ email: req.body.email });
    if (existingData) {
      // If a match is found, send an appropriate response
      res.status(400).send('Data with this email already exists.');
    } else {
      // If no match is found, save the new data
      const formData = new FormModel(req.body);
      await formData.save();
      res.redirect('/login.html');  // Redirect with query parameter
    }
  } catch (err) {
    console.error('Failed to save form data:', err);
    res.status(500).send('Failed to save form data');
  }
});


//Login section

app.post('/login-form', async (req, res) =>{

  try{
    const existingDataBlock = await FormModel.findOne(
      {email: req.body.email, 
      password: req.body.password});
    if(existingDataBlock){
      res.redirect('/main.html');
    }else{
      res.status(404).send('There is no such data located in the database');
    }
  }catch(err){
    console.error('Error retrieving the data:', err);
    res.status(500).send('Internal server error ');
  }
});

//Server responses section
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

//Server section end

// Obsługa błędu 404
app.use((req, res, next) => {
    res.status(404).send('Przepraszamy, taka trasa nie istnieje.');
  });
  
  // Obsługa błędów
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Coś poszło nie tak!');
  });