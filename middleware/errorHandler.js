function errorHandler(err, req, res, next) {
    console.error('🔮 Spell Exception Caught:', err);
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'An enchanted glitch occurred in the apothecary',
        stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
}

function notFound(req, res, next) {
    res.status(404).json({
        success: false,
        message: `Spell portal not found: ${req.originalUrl}`
    });
}

module.exports = { errorHandler, notFound };

