const express = require('express');

const router = express.Router();

const { postEmail } = require('../controllers/communicate');

router.post('/', postEmail);

module.exports = router;
