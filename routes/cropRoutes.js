const express = require('express');
const controller = require('../controller/cropController'); // Fixed path
const router = express.Router();

router.get('/monthly', controller.getMonthlyPrediction);
module.exports = router;