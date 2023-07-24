const {addExpense, getExpense, deleteExpense} = require('../controllers/expense');
const {addIncome, getIncomes, deleteIncome} = require('../controllers/income');
const {loginUser, registerUser} = require('../controllers/authController');
const {addCategory, getCategories} = require('../controllers/category');
const {getStats} = require('../controllers/stats');
const jwt = require('jsonwebtoken');

const router = require('express').Router();

const authenticateUser = (req, res, next) => {
    // Get the token from the request headers
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({status : 401, message: 'Unauthorized, bearer token missing.' });
    }

    // Extract the token from the "Authorization" header
    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({status : 401, message: 'Unauthorized, bearer token missing.' });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_TOKEN);

        next();
    } catch (error) {
        res.status(401).json({status : 401, message: 'Invalid bearer token, access denied.' });
    }
};

router.post('/add-income', authenticateUser, addIncome)
    .get('/get-incomes',authenticateUser, getIncomes)
    .delete('/delete-income/:id',authenticateUser, deleteIncome)
    .post('/add-category',authenticateUser, addCategory)
    .get('/get-categories',authenticateUser, getCategories)
    .post('/add-expense',authenticateUser, addExpense)
    .get('/get-expenses',authenticateUser, getExpense)
    .get('/get-stats',authenticateUser, getStats)
    .delete('/delete-expense/:id',authenticateUser, deleteExpense)
    .post('/login', loginUser)
    .post('/register', registerUser);

module.exports = router;