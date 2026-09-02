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
const {getExercises, getExerciseMuscles, getExerciseEquipments, getExerciseAnimation, getExerciseCatalog, getExerciseCatalogMuscles, seedExerciseMetadata} = require('../controllers/exerciseAnimation');
const {getWorkoutPlans, getWorkoutPlan, getActiveWorkoutPlan, addWorkoutPlan, updateWorkoutPlan, duplicateWorkoutPlan, deleteWorkoutPlan, reorderWorkoutPlans, addRoutine, updateRoutine, deleteRoutine, reorderRoutines, addRoutineExercise, updateRoutineExercise, deleteRoutineExercise, reorderRoutineExercises} = require('../controllers/workoutPlan');
const {getCustomExercises, addCustomExercise, updateCustomExercise, deleteCustomExercise} = require('../controllers/customExercise');
const {startWorkoutSession, getActiveWorkoutSession, updateWorkoutSessionSet, addWorkoutSessionSet, deleteWorkoutSessionSet, finishWorkoutSession, getWorkoutSession, deleteWorkoutSession, getWorkoutSessions, getExerciseHistory, getPreviousExercises} = require('../controllers/workoutSession');
const {addCalories, processFoodText, getDailyCalories, deleteMealItem, updateCalorieGoals, calculateGoals, getCalorieHistory, addWeightEntry, getWeightHistory, deleteWeightEntry, updateTargetWeight} = require('../controllers/calories');
const CalorieEntry = require('../models/CalorieEntryModel');
const { processEntry } = require('../services/groq');
const jwt = require('jsonwebtoken');
const moment = require('moment');

const router = require('express').Router();

// Health check endpoint (no auth required) — keeps Render dyno warm + retries failed entries
router.get('/health', async (req, res) => {
  // Fire-and-forget retry of failed/pending entries (don't await)
  (async () => {
    try {
      const fiveMinAgo = moment().subtract(5, 'minutes').toISOString();
      const failed = await CalorieEntry.find({
        status: { $in: ['failed', 'pending'] },
        updatedAt: { $lt: fiveMinAgo },
      }).lean();

      for (const entry of failed) {
        if (entry.foodText) {
          console.log(`[retry] Processing failed entry ${entry._id}: "${entry.foodText.substring(0, 50)}..."`);
          processEntry(entry._id, entry.foodText).catch(err => {
            console.error(`[retry] Failed to retry entry ${entry._id}:`, err.message);
          });
        }
      }
    } catch (err) {
      console.error('[retry] Error scanning for failed entries:', err.message);
    }
  })();

  res.json({ status: 'ok', timestamp: Date.now() });
});

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
    .put('/update-calorie-goals', authenticateUser, updateCalorieGoals)
    .post('/calculate-calorie-goals', authenticateUser, calculateGoals)
    .get('/get-calorie-history', authenticateUser, getCalorieHistory)
    .post('/add-weight-entry', authenticateUser, addWeightEntry)
    .get('/get-weight-history', authenticateUser, getWeightHistory)
    .delete('/delete-weight-entry/:id', authenticateUser, deleteWeightEntry)
    .put('/update-target-weight', authenticateUser, updateTargetWeight)
    .get('/get-exercises', authenticateUser, getExercises)
    .get('/get-exercise-muscles', authenticateUser, getExerciseMuscles)
    .get('/get-exercise-equipments', authenticateUser, getExerciseEquipments)
    .get('/get-exercise-animation', authenticateUser, getExerciseAnimation)
    .get('/get-exercise-catalog', authenticateUser, getExerciseCatalog)
    .get('/get-exercise-catalog-muscles', authenticateUser, getExerciseCatalogMuscles)
    // Boot reseeds on its own whenever the rules change; this is the on-demand
    // door for a host where restarting or reaching a shell is awkward.
    .post('/seed-exercise-metadata', authenticateUser, seedExerciseMetadata)
    .get('/get-workout-plans', authenticateUser, getWorkoutPlans)
    .get('/get-active-workout-plan', authenticateUser, getActiveWorkoutPlan)
    .get('/get-workout-plan/:id', authenticateUser, getWorkoutPlan)
    .post('/add-workout-plan', authenticateUser, addWorkoutPlan)
    .put('/update-workout-plan/:id', authenticateUser, updateWorkoutPlan)
    .post('/duplicate-workout-plan/:id', authenticateUser, duplicateWorkoutPlan)
    .delete('/delete-workout-plan/:id', authenticateUser, deleteWorkoutPlan)
    .put('/reorder-workout-plans', authenticateUser, reorderWorkoutPlans)
    .post('/add-routine/:planId', authenticateUser, addRoutine)
    .put('/update-routine/:planId/:routineId', authenticateUser, updateRoutine)
    .delete('/delete-routine/:planId/:routineId', authenticateUser, deleteRoutine)
    .put('/reorder-routines/:planId', authenticateUser, reorderRoutines)
    .post('/add-routine-exercise/:planId/:routineId', authenticateUser, addRoutineExercise)
    .put('/update-routine-exercise/:planId/:routineId/:exerciseId', authenticateUser, updateRoutineExercise)
    .delete('/delete-routine-exercise/:planId/:routineId/:exerciseId', authenticateUser, deleteRoutineExercise)
    .put('/reorder-routine-exercises/:planId/:routineId', authenticateUser, reorderRoutineExercises)
    .get('/get-custom-exercises', authenticateUser, getCustomExercises)
    .post('/add-custom-exercise', authenticateUser, addCustomExercise)
    .put('/update-custom-exercise/:id', authenticateUser, updateCustomExercise)
    .delete('/delete-custom-exercise/:id', authenticateUser, deleteCustomExercise)
    .post('/start-workout-session', authenticateUser, startWorkoutSession)
    .get('/get-active-workout-session', authenticateUser, getActiveWorkoutSession)
    .get('/get-workout-sessions', authenticateUser, getWorkoutSessions)
    .get('/get-workout-session/:id', authenticateUser, getWorkoutSession)
    .post('/add-workout-session-set/:id/:exerciseId', authenticateUser, addWorkoutSessionSet)
    .put('/update-workout-session-set/:id/:exerciseId/:setId', authenticateUser, updateWorkoutSessionSet)
    .delete('/delete-workout-session-set/:id/:exerciseId/:setId', authenticateUser, deleteWorkoutSessionSet)
    .post('/finish-workout-session/:id', authenticateUser, finishWorkoutSession)
    .delete('/delete-workout-session/:id', authenticateUser, deleteWorkoutSession)
    .get('/get-exercise-history', authenticateUser, getExerciseHistory)
    .get('/get-previous-exercises', authenticateUser, getPreviousExercises)
    .post('/login', loginUser)
    .post('/register', registerUser)
    .get('/', baseAction)
;

module.exports = router;
