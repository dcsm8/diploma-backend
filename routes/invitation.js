const express = require('express');

const router = express.Router();

const { postInvitation } = require('../controllers/invitation');

router.post('/', postInvitation);

module.exports = router;
