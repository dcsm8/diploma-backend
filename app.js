require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

const communicateRoute = require('./routes/communicate');
const signatureRoute = require('./routes/signature');
const invitationRoute = require('./routes/invitation');

// Parse application/json
app.use(bodyParser.json());

// Add cors
app.use(cors());

app.use('/api/v1/communicate', communicateRoute);
app.use('/api/v1/signature', signatureRoute);
app.use('/api/v1/invitation', invitationRoute);

// Error Handling
app.use((err, req, res, next) => {
  console.log(err);
  console.log(err.stack);
  next(err);
});

app.use((err, req, res) => {
  res.status(500).send({
    error: err
  });
});

// Export your Express configuration so that it can be consumed by the Lambda handler
module.exports = app;