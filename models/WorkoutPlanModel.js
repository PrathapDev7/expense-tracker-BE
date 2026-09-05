const mongoose = require('mongoose');

// A planned set. Which fields carry meaning depends on the parent exercise's
// mode: weights/bodyweight uses reps + weight, time/distance uses durationSec +
// distance. Everything is optional because the UI lets you add an empty set row
// and fill it in later -- an unfilled weight shows as "-", which is not zero.
const plannedSetSchema = new mongoose.Schema({
    reps: {type: Number, min: 0},
    weight: {type: Number, min: 0},
    durationSec: {type: Number, min: 0},
    distance: {type: Number, min: 0},
});

const routineExerciseSchema = new mongoose.Schema({
    // The animation catalog path when this came from the catalog. Kept alongside
    // the denormalized fields below rather than instead of them: the catalog is
    // reseeded from an archive, and a routine must still render its own name and
    // muscle if a path ever changes underneath it.
    catalogId: {
        type: String,
        trim: true,
    },
    // Set instead of catalogId for a user's own exercise ("Add custom").
    customExercise: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CustomExercise',
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxLength: 120,
    },
    muscle: {
        type: String,
        trim: true,
    },
    // The fine muscle, copied in alongside the coarse one for the same reason
    // the name is: the summary chart is drawn from what the routine recorded,
    // not from a lookup that could answer differently later.
    primaryMuscle: {
        type: String,
        trim: true,
    },
    equipment: {
        type: String,
        trim: true,
    },
    mode: {
        type: String,
        enum: ['weights', 'time'],
        default: 'weights',
    },
    // Per exercise, not per user: the picker lets you log one lift in kg and
    // another in lb without converting anything.
    weightUnit: {
        type: String,
        enum: ['kg', 'lb'],
        default: 'kg',
    },
    sets: {
        type: [plannedSetSchema],
        default: [],
    },
    // 0 means the rest timer is off for this exercise, which is the default the
    // UI shows as "Rest: Off" -- distinct from a rest of unknown length.
    restBetweenSetsSec: {
        type: Number,
        default: 0,
        min: 0,
    },
    color: {
        type: String,
        trim: true,
    },
    notes: {
        type: String,
        trim: true,
        maxLength: 2000,
    },
    order: {
        type: Number,
        default: 0,
    },
});

// One day of a plan -- "Push A", "Pull A", "Legs".
const routineSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxLength: 60,
    },
    order: {
        type: Number,
        default: 0,
    },
    restBetweenExercisesSec: {
        type: Number,
        default: 0,
        min: 0,
    },
    exercises: {
        type: [routineExerciseSchema],
        default: [],
    },
}, {timestamps: true});

const reminderSchema = new mongoose.Schema({
    // 0 = Sunday, matching Date#getDay so the client does not have to remap.
    dayOfWeek: {
        type: Number,
        min: 0,
        max: 6,
        required: true,
    },
    // "HH:mm" in the user's local time. Stored as text on purpose: a reminder is
    // "07:30 on Mondays", which is a wall-clock intent, not an instant, and
    // survives the user changing time zone.
    time: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
});

// Routines and their exercises are embedded rather than referenced.
//
// Every screen that touches a plan needs the whole tree -- the routine tabs, the
// exercise cards, the reorder sheet -- so splitting them into collections would
// turn one read into three. Reordering, duplicating and deleting all become
// single-document writes, which is also what makes them atomic. A large plan
// (10 routines x 15 exercises x 6 sets) is well under 100 KB against a 16 MB
// document limit, so there is no growth path that outruns this.
const workoutPlanSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxLength: 60,
    },
    order: {
        type: Number,
        default: 0,
    },
    // The plan the switcher opens on. Kept as a flag on the plan rather than a
    // pointer on the user so that deleting a plan cannot leave a dangling
    // reference; the controller clears the others when it sets one.
    isActive: {
        type: Boolean,
        default: false,
    },
    remindersEnabled: {
        type: Boolean,
        default: false,
    },
    reminders: {
        type: [reminderSchema],
        default: [],
    },
    routines: {
        type: [routineSchema],
        default: [],
    },
}, {timestamps: true});

workoutPlanSchema.index({user: 1, order: 1});

module.exports = mongoose.model('WorkoutPlan', workoutPlanSchema);
