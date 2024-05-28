const express = require('express');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const port = 3000;
const routes = require('./routes/index')
const cnctionString = "mongodb://localhost:27017/Korepetycje";





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

// Route to handle form submission
app.post('/submit-form', (req, res) => {
  const formData = new FormModel(req.body);
  formData.save()
    .then(() => {
      res.send('Form data saved successfully!');
    })
    .catch((err) => {
      res.status(500).send('Failed to save form data');
      console.error(err);
    });
});

//Server responses
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