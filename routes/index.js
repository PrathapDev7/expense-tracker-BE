const {addExpense, getExpense, deleteExpense, updateExpense} = require('../controllers/expense');
const {addIncome, getIncomes, deleteIncome, updateIncome} = require('../controllers/income');
const {addUserBudget, getUserBudget, updateUserBudget} = require('../controllers/UserController');
const {loginUser, registerUser, updatePassword, updateProfile} = require('../controllers/authController');
const {addCategory, getCategories, getRecentCategories, updateCategory, deleteCategory} = require('../controllers/category');
const {addSubCategory, getSubCategories} = require('../controllers/subCategory');
const {getStats, getProfile, baseAction} = require('../controllers/Common');
const {uploadImage, uploadImageMiddleware} = require('../controllers/upload');
const {addRecurring, getRecurring, updateRecurring, deleteRecurring} = require('../controllers/recurring');
const {addGoal, getGoals, updateGoal, contributeGoal, deleteGoal} = require('../controllers/goal');
const {addWallet, getWallets, updateWallet, deleteWallet} = require('../controllers/wallet');
const {getInsights} = require('../controllers/insights');
const {addCalories, processFoodText, getDailyCalories, deleteMealItem} = require('../controllers/calories');
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
    .get('/get-categories',authenticateUser, getCategories)
    .get('/get-recent-categories',authenticateUser, getRecentCategories)
    .put('/update-category/:id',authenticateUser, updateCategory)
    .delete('/delete-category/:id',authenticateUser, deleteCategory)
    .post('/add-sub-category',authenticateUser, addSubCategory)
    .get('/get-sub-categories',authenticateUser, getSubCategories)
    .post('/add-expense',authenticateUser, addExpense)
    .put('/update-expense/:id',authenticateUser, updateExpense)
    .get('/get-expenses',authenticateUser, getExpense)
    .get('/get-stats',authenticateUser, getStats)
    .delete('/delete-expense/:id',authenticateUser, deleteExpense)
    .get('/get-budgets',authenticateUser, getUserBudget)
    .put('/update-budgets/:id',authenticateUser, updateUserBudget)
    .post('/add-budgets',authenticateUser, addUserBudget)
    .post('/add-recurring',authenticateUser, addRecurring)
    .get('/get-recurring',authenticateUser, getRecurring)
    .put('/update-recurring/:id',authenticateUser, updateRecurring)
    .delete('/delete-recurring/:id',authenticateUser, deleteRecurring)
    .post('/add-goal',authenticateUser, addGoal)
    .get('/get-goals',authenticateUser, getGoals)
    .put('/update-goal/:id',authenticateUser, updateGoal)
    .post('/contribute-goal/:id',authenticateUser, contributeGoal)
    .delete('/delete-goal/:id',authenticateUser, deleteGoal)
    .post('/add-wallet',authenticateUser, addWallet)
    .get('/get-wallets',authenticateUser, getWallets)
    .put('/update-wallet/:id',authenticateUser, updateWallet)
    .delete('/delete-wallet/:id',authenticateUser, deleteWallet)
    .get('/get-insights',authenticateUser, getInsights)
    .get('/get-profile',authenticateUser, getProfile)
    .post('/update-password',authenticateUser, updatePassword)
    .post('/update-profile',authenticateUser, updateProfile)
    .post('/upload-image', authenticateUser, uploadImageMiddleware, uploadImage)
    .post('/add-calories', authenticateUser, addCalories)
    .post('/process-food-text', authenticateUser, processFoodText)
    .get('/get-daily-calories', authenticateUser, getDailyCalories)
    .delete('/delete-meal-item/:itemId', authenticateUser, deleteMealItem)
    .post('/login', loginUser)
    .post('/register', registerUser)
    .get('/', baseAction)
;

module.exports = router;
