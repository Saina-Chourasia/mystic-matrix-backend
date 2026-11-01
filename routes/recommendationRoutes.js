const express = require('express');
const router = express.Router();
const RecommendationController = require('../controllers/recommendationController');

router.get('/', RecommendationController.getAll);
router.post('/:productId/apply-restock', RecommendationController.applyRestock);

module.exports = router;

