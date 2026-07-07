const {
    getAdminStats,
    getAdminUsers,
    getAdminTransactions,
    getAdminWallets,
    getAdminGoals,
} = require('../controllers/admin');

const router = require('express').Router();

const authenticateAdmin = (req, res, next) => {
    const secret = req.header('x-admin-secret');
    if (!secret || !process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ status: 403, message: 'Forbidden: invalid admin secret.' });
    }
    next();
};

router
    .get('/admin/stats', authenticateAdmin, getAdminStats)
    .get('/admin/users', authenticateAdmin, getAdminUsers)
    .get('/admin/transactions', authenticateAdmin, getAdminTransactions)
    .get('/admin/wallets', authenticateAdmin, getAdminWallets)
    .get('/admin/goals', authenticateAdmin, getAdminGoals);

module.exports = router;
