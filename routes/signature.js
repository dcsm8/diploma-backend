const express = require('express');

const router = express.Router();

const { postSignature, postValidate } = require('../controllers/signature');

router.post('/', postSignature);
router.post('/validate', postValidate);

module.exports = router;
