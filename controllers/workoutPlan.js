const WorkoutPlanSchema = require('../models/WorkoutPlanModel');

// Order is the position in the embedded array -- that is the only place it can
// live without two sources of truth disagreeing. The `order` field is kept in
// sync on every write so clients have a stable number to read, but nothing here
// sorts a routine or an exercise by it.
const resequence = (items) => {
    items.forEach((item, index) => {
        item.order = index;
    });
};

const findPlan = (req) => WorkoutPlanSchema.findOne({
    _id: req.params.planId || req.params.id,
    user: req.user.id,
});

// Applies only the keys the caller actually sent, so a PUT carrying one field
// does not blank out the rest.
const applyFields = (target, body, allowed) => {
    allowed.forEach((key) => {
        if (body[key] !== undefined) target[key] = body[key];
    });
};

// Reorders an embedded array to match a list of ids. Ids missing from the list
// keep their relative order and go to the end, so a client working from a
// slightly stale copy reorders what it knows about instead of dropping the rest.
const reorderById = (items, ids) => {
    const position = new Map(ids.map((id, index) => [String(id), index]));
    const rank = (item) => (position.has(String(item._id))
        ? position.get(String(item._id))
        : Number.MAX_SAFE_INTEGER);

    const ordered = [...items].sort((a, b) => rank(a) - rank(b));
    items.splice(0, items.length);
    ordered.forEach((item) => items.push(item));
    resequence(items);
};

/* --------------------------------------------------------------- plans --- */

/**
 * The plan switcher's list.
 *
 * Deliberately without the exercise trees: the switcher shows a name and a tick,
 * and returning every plan in full would ship the user's entire training setup
 * to render a sheet with three rows in it.
 */
exports.getWorkoutPlans = async (req, res) => {
    try {
        const plans = await WorkoutPlanSchema
            .find({user: req.user.id})
            .select('name order isActive remindersEnabled reminders routines._id routines.name routines.order createdAt updatedAt')
            .sort({order: 1, createdAt: 1})
            .lean();

        res.status(200).json({data: plans});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/** One plan with its full routine and exercise tree -- the workout screen. */
exports.getWorkoutPlan = async (req, res) => {
    try {
        const plan = await WorkoutPlanSchema.findOne({_id: req.params.id, user: req.user.id}).lean();

        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        res.status(200).json({data: plan});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/** The plan the app opens on. Falls back to the first one if none is flagged. */
exports.getActiveWorkoutPlan = async (req, res) => {
    try {
        const plan = await WorkoutPlanSchema.findOne({user: req.user.id, isActive: true}).lean()
            || await WorkoutPlanSchema.findOne({user: req.user.id}).sort({order: 1, createdAt: 1}).lean();

        res.status(200).json({data: plan || null});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.addWorkoutPlan = async (req, res) => {
    const {name, routines} = req.body;

    try {
        if (!name || !String(name).trim()) {
            return res.status(400).json({message: 'name is required.'});
        }

        const count = await WorkoutPlanSchema.countDocuments({user: req.user.id});

        const plan = await WorkoutPlanSchema.create({
            user: req.user.id,
            name: String(name).trim(),
            order: count,
            // The first plan a user creates is the one the app should open on.
            isActive: count === 0,
            routines: Array.isArray(routines)
                ? routines.map((routine, index) => ({
                    name: String(routine && routine.name ? routine.name : '').trim(),
                    order: index,
                }))
                : [],
        });

        res.status(200).json({message: 'Workout plan added', data: plan});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.updateWorkoutPlan = async (req, res) => {
    try {
        const plan = await WorkoutPlanSchema.findOne({_id: req.params.id, user: req.user.id});

        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        applyFields(plan, req.body, ['name', 'remindersEnabled', 'reminders']);
        if (req.body.name !== undefined) plan.name = String(req.body.name || '').trim();

        // Exactly one plan is active, so activating this one has to stand the
        // others down. Done before the save so a validation failure below leaves
        // the user with the plan they already had rather than with none.
        if (req.body.isActive === true) {
            await WorkoutPlanSchema.updateMany(
                {user: req.user.id, _id: {$ne: plan._id}},
                {$set: {isActive: false}},
            );
            plan.isActive = true;
        }

        await plan.save();

        res.status(200).json({message: 'Workout plan updated', data: plan});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * Copies a plan with its routines and every exercise in them.
 *
 * The subdocument _ids are stripped so Mongo mints new ones -- without that the
 * copy shares set and exercise ids with the original, and any client keying off
 * them would treat an edit to one as an edit to the other.
 */
exports.duplicateWorkoutPlan = async (req, res) => {
    try {
        const source = await WorkoutPlanSchema.findOne({_id: req.params.id, user: req.user.id}).lean();

        if (!source) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        const strip = (value) => {
            if (Array.isArray(value)) return value.map(strip);
            if (value && typeof value === 'object' && !(value instanceof Date) && value.constructor === Object) {
                const copy = {};
                Object.entries(value).forEach(([key, nested]) => {
                    if (['_id', '__v', 'user', 'createdAt', 'updatedAt'].includes(key)) return;
                    copy[key] = strip(nested);
                });
                return copy;
            }
            return value;
        };

        const count = await WorkoutPlanSchema.countDocuments({user: req.user.id});

        const plan = await WorkoutPlanSchema.create({
            ...strip(source),
            user: req.user.id,
            name: String(req.body.name || `${source.name} copy`).trim().slice(0, 60),
            order: count,
            isActive: false,
        });

        res.status(200).json({message: 'Workout plan duplicated', data: plan});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteWorkoutPlan = async (req, res) => {
    try {
        const plan = await WorkoutPlanSchema.findOneAndDelete({_id: req.params.id, user: req.user.id});

        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        // Deleting the active plan would otherwise leave the app with nothing to
        // open on, so the next one in order takes over.
        if (plan.isActive) {
            const next = await WorkoutPlanSchema.findOne({user: req.user.id}).sort({order: 1, createdAt: 1});
            if (next) {
                next.isActive = true;
                await next.save();
            }
        }

        res.status(200).json({message: 'Workout plan deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.reorderWorkoutPlans = async (req, res) => {
    const {planIds} = req.body;

    try {
        if (!Array.isArray(planIds)) {
            return res.status(400).json({message: 'planIds must be an array.'});
        }

        await Promise.all(planIds.map((planId, index) => WorkoutPlanSchema.updateOne(
            {_id: planId, user: req.user.id},
            {$set: {order: index}},
        )));

        res.status(200).json({message: 'Workout plans reordered'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/* ------------------------------------------------------------ routines --- */

exports.addRoutine = async (req, res) => {
    const {name} = req.body;

    try {
        if (!name || !String(name).trim()) {
            return res.status(400).json({message: 'name is required.'});
        }

        const plan = await findPlan(req);
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        plan.routines.push({name: String(name).trim(), order: plan.routines.length});
        await plan.save();

        res.status(200).json({
            message: 'Routine added',
            data: plan.routines[plan.routines.length - 1],
        });
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.updateRoutine = async (req, res) => {
    try {
        const plan = await findPlan(req);
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        const routine = plan.routines.id(req.params.routineId);
        if (!routine) {
            return res.status(404).json({message: 'Routine not found'});
        }

        applyFields(routine, req.body, ['name', 'restBetweenExercisesSec']);
        if (req.body.name !== undefined) routine.name = String(req.body.name || '').trim();

        await plan.save();

        res.status(200).json({message: 'Routine updated', data: routine});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteRoutine = async (req, res) => {
    try {
        const plan = await findPlan(req);
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        if (!plan.routines.id(req.params.routineId)) {
            return res.status(404).json({message: 'Routine not found'});
        }

        plan.routines.pull(req.params.routineId);
        resequence(plan.routines);
        await plan.save();

        res.status(200).json({message: 'Routine deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.reorderRoutines = async (req, res) => {
    const {routineIds} = req.body;

    try {
        if (!Array.isArray(routineIds)) {
            return res.status(400).json({message: 'routineIds must be an array.'});
        }

        const plan = await findPlan(req);
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        reorderById(plan.routines, routineIds);
        await plan.save();

        res.status(200).json({message: 'Routines reordered', data: plan.routines});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/* --------------------------------------------------- routine exercises --- */

const EXERCISE_FIELDS = [
    'catalogId', 'customExercise', 'name', 'muscle', 'primaryMuscle', 'equipment', 'mode',
    'weightUnit', 'sets', 'restBetweenSetsSec', 'color', 'notes',
];

exports.addRoutineExercise = async (req, res) => {
    try {
        if (!req.body.name || !String(req.body.name).trim()) {
            return res.status(400).json({message: 'name is required.'});
        }

        const plan = await findPlan(req);
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        const routine = plan.routines.id(req.params.routineId);
        if (!routine) {
            return res.status(404).json({message: 'Routine not found'});
        }

        const exercise = {order: routine.exercises.length};
        EXERCISE_FIELDS.forEach((key) => {
            if (req.body[key] !== undefined) exercise[key] = req.body[key];
        });
        exercise.name = String(req.body.name).trim();

        routine.exercises.push(exercise);
        await plan.save();

        res.status(200).json({
            message: 'Exercise added',
            data: routine.exercises[routine.exercises.length - 1],
        });
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.updateRoutineExercise = async (req, res) => {
    try {
        const plan = await findPlan(req);
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        const routine = plan.routines.id(req.params.routineId);
        if (!routine) {
            return res.status(404).json({message: 'Routine not found'});
        }

        const exercise = routine.exercises.id(req.params.exerciseId);
        if (!exercise) {
            return res.status(404).json({message: 'Exercise not found'});
        }

        applyFields(exercise, req.body, EXERCISE_FIELDS);
        if (req.body.name !== undefined) exercise.name = String(req.body.name || '').trim();

        await plan.save();

        res.status(200).json({message: 'Exercise updated', data: exercise});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteRoutineExercise = async (req, res) => {
    try {
        const plan = await findPlan(req);
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        const routine = plan.routines.id(req.params.routineId);
        if (!routine) {
            return res.status(404).json({message: 'Routine not found'});
        }

        if (!routine.exercises.id(req.params.exerciseId)) {
            return res.status(404).json({message: 'Exercise not found'});
        }

        routine.exercises.pull(req.params.exerciseId);
        resequence(routine.exercises);
        await plan.save();

        res.status(200).json({message: 'Exercise deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * The reorder-and-remove sheet saves in one call.
 *
 * It carries the rest-between-exercises value too, because that sheet owns both
 * and sending them as two requests would let a save half-apply.
 */
exports.reorderRoutineExercises = async (req, res) => {
    const {exerciseIds, restBetweenExercisesSec} = req.body;

    try {
        if (!Array.isArray(exerciseIds)) {
            return res.status(400).json({message: 'exerciseIds must be an array.'});
        }

        const plan = await findPlan(req);
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        const routine = plan.routines.id(req.params.routineId);
        if (!routine) {
            return res.status(404).json({message: 'Routine not found'});
        }

        // Ids the client left out are the ones it removed in the sheet.
        const keep = new Set(exerciseIds.map(String));
        routine.exercises
            .filter((exercise) => !keep.has(String(exercise._id)))
            .map((exercise) => String(exercise._id))
            .forEach((exerciseId) => routine.exercises.pull(exerciseId));

        reorderById(routine.exercises, exerciseIds);

        if (restBetweenExercisesSec !== undefined) {
            routine.restBetweenExercisesSec = restBetweenExercisesSec;
        }

        await plan.save();

        res.status(200).json({message: 'Exercises reordered', data: routine});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/* -------------------------------------------------------- routine builder --- */

/**
 * Drafts a week from a short brief, and redrafts it from a change request.
 *
 * Stateless on purpose: the client sends the plan it is looking at back with
 * the change ("swap the squats"), so nothing here has to remember a
 * conversation, and a draft can be revised from any device.
 */
exports.buildRoutines = async (req, res) => {
    try {
        const {buildPlan} = require('../services/workoutPlanner');

        const plan = await buildPlan({
            brief: req.body.brief || {},
            current: req.body.current,
            request: req.body.request,
        });

        res.status(200).json({message: 'Plan drafted', data: plan});
    } catch (error) {
        // 502 rather than 500: every model in the chain failed or answered with
        // something unparseable, which is worth retrying rather than a bug.
        console.error(`[planner] ${error.message || error}`);
        res.status(502).json({message: 'Could not draft a plan right now. Try again.'});
    }
};

/**
 * Writes an accepted draft over the plan.
 *
 * The whole routine tree is replaced, not merged: the builder writes a fresh
 * week, and folding it into what was already there would leave a plan that is
 * neither. The client confirms that with the user first.
 */
exports.applyBuiltRoutines = async (req, res) => {
    const {routines} = req.body;

    try {
        if (!Array.isArray(routines) || !routines.length) {
            return res.status(400).json({message: 'routines is required.'});
        }

        const plan = await findPlan(req);
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        plan.routines = routines.slice(0, 7).map((routine, index) => ({
            name: String(routine.name || '').trim().slice(0, 60) || `Day ${index + 1}`,
            order: index,
            restBetweenExercisesSec: Number(routine.restBetweenExercisesSec) || 0,
            exercises: (Array.isArray(routine.exercises) ? routine.exercises : [])
                .filter((exercise) => exercise && String(exercise.name || '').trim())
                .map((exercise, position) => {
                    const built = {order: position};
                    EXERCISE_FIELDS.forEach((key) => {
                        if (exercise[key] !== undefined) built[key] = exercise[key];
                    });
                    built.name = String(exercise.name).trim();
                    return built;
                }),
        }));

        await plan.save();

        res.status(200).json({message: 'Plan built', data: plan});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
