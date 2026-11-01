const express = require('express');
const router = express.Router();
const ForecastController = require('../controllers/forecastController');

router.get('/evaluations', ForecastController.getEvaluations);
router.get('/', ForecastController.getAll);
router.get('/:id', ForecastController.getByProduct);

module.exports = router;
