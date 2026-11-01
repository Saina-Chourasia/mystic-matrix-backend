const authService = require('../services/authService');
const userModel = require('../models/userModel');

class ProfileController {
    /**
     * Get Current Profile Details
     */
    getProfile(req, res) {
        try {
            const user = userModel.findById(req.user.id);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            res.json({
                success: true,
                data: authService.sanitizeUser(user)
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Update Current Profile (Disallows changing role)
     */
    updateProfile(req, res) {
        try {
            const userId = req.user.id;
            const { name, phone, preferences } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;

            const updated = authService.updateProfile(userId, { name, phone, preferences }, ipAddress);

            res.json({
                success: true,
                message: 'Your alchemist profile has been updated.',
                data: updated
            });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Change Password
     */
    changePassword(req, res) {
        try {
            const userId = req.user.id;
            const { currentPassword, newPassword } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;

            const result = authService.changePassword(userId, currentPassword, newPassword, ipAddress);

            res.json(result);
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
}

module.exports = new ProfileController();

