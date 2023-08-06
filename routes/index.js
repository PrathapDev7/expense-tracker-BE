
const {addExpense, getExpense, deleteExpense, updateExpense} = require('../controllers/expense');
const {addIncome, getIncomes, deleteIncome, updateIncome} = require('../controllers/income');
const {addUserBudget, getUserBudget, updateUserBudget} = require('../controllers/UserController');
const {loginUser, registerUser, verifyUser, resendOTP, updatePassword, updateProfile} = require('../controllers/authController');
const {addCategory, getCategories} = require('../controllers/category');
const {addSubCategory, getSubCategories} = require('../controllers/subCategoryController');
const {getStats, getProfile, baseAction} = require('../controllers/Common');
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
    .put('/update-income/:id',authenticateUser, updateIncome)
    .post('/add-category',authenticateUser, addCategory)
    .post('/add-sub-category',authenticateUser, addSubCategory)
    .get('/get-categories',authenticateUser, getCategories)
    .get('/get-sub-categories',authenticateUser, getSubCategories)
    .post('/add-expense',authenticateUser, addExpense)
    .put('/update-expense/:id',authenticateUser, updateExpense)
    .get('/get-expenses',authenticateUser, getExpense)
    .get('/get-stats',authenticateUser, getStats)
    .delete('/delete-expense/:id',authenticateUser, deleteExpense)
    .get('/get-budgets',authenticateUser, getUserBudget)
    .put('/update-budgets/:id',authenticateUser, updateUserBudget)
    .post('/add-budgets',authenticateUser, addUserBudget)
    .get('/get-profile',authenticateUser, getProfile)
    .post('/update-password',authenticateUser, updatePassword)
    .post('/update-profile',authenticateUser, updateProfile)
    .post('/resend-otp', resendOTP)
    .post('/login', loginUser)
    .post('/verify-otp',verifyUser)
    .post('/register', registerUser)
    .get('/', baseAction);

module.exports = router;
