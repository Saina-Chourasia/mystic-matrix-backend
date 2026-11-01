const RecommendationService = require('../services/recommendationService');

class RecommendationController {
    static getAll(req, res) {
        try {
            const { halloweenMultiplier } = req.query;
            const options = {
                halloweenMultiplierSetting: halloweenMultiplier ? parseFloat(halloweenMultiplier) : 1.0
            };
            const recs = RecommendationService.getRecommendations(options);
            res.json({ success: true, count: recs.length, data: recs });
        } catch (error) {
            console.error('Recommendations error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static applyRestock(req, res) {
        try {
            const { productId } = req.params;
            const quantity = parseInt(req.body.quantity || req.body.reorder_quantity, 10);
            const reason = req.body.reason || req.body.notes || 'Automated recommendation execution';

            if (!quantity || quantity <= 0) {
                return res.status(400).json({ success: false, message: 'Valid replenishment quantity required.' });
            }

            const updatedProduct = RecommendationService.applyRestock(productId, quantity, reason);
            res.json({
                success: true,
                message: `Successfully received shipment of ${quantity} units for ${updatedProduct.name}!`,
                data: updatedProduct
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = RecommendationController;

