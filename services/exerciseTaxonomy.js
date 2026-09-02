/**
 * The exercise knowledge base: a finer muscle taxonomy and written instructions
 * for every movement in the animation catalog.
 *
 * The catalog ships with neither. It carries 10 coarse muscle values (ABS, ARMS,
 * BACK, LEGS, UPPER BODY...) and no description field at all, which leaves the
 * exercise picker unable to say what an exercise trains beyond "ARMS", the
 * post-workout chart with four blunt slices, and the exercise sheet's notes
 * field empty. Both are authored here rather than fetched, because nothing
 * upstream supplies them.
 *
 * The catalog is 1,603 rows but only 1,069 distinct names, and those names are
 * built compositionally -- [equipment] [position] [grip] [movement] [(view)] --
 * so this is a rule library over that grammar rather than 1,069 hand-written
 * records. A rule matches a movement phrase and supplies the muscles worked and
 * the steps; the equipment, position and grip words in the same name choose the
 * setup sentence and add the cues. "Barbell Bent Over Row" and "Cable Seated
 * Wide Grip Row" share one rule and still read as two different exercises.
 *
 * Everything here is pure -- no database, no io -- so it can be unit tested and
 * so the seeder can hash this file to know when the rules have changed.
 */

/* -------------------------------------------------------------- the taxonomy */

// Finer than the catalog's 10, coarse enough to stay legible as a chart legend
// and as a one-word label under an exercise name in the picker. Splitting the
// catalog's ARMS into Biceps/Triceps/Forearms and its BACK into Lats/Upper
// Back/Traps/Lower Back is the whole point: "Arms 4" says much less than
// "Biceps 2, Triceps 2".
const MUSCLES = {
    ABS: 'Abs',
    OBLIQUES: 'Obliques',
    LOWER_BACK: 'Lower Back',
    LATS: 'Lats',
    UPPER_BACK: 'Upper Back',
    TRAPS: 'Traps',
    CHEST: 'Chest',
    SHOULDERS: 'Shoulders',
    REAR_DELTS: 'Rear Delts',
    ROTATOR_CUFF: 'Rotator Cuff',
    BICEPS: 'Biceps',
    TRICEPS: 'Triceps',
    FOREARMS: 'Forearms',
    QUADS: 'Quads',
    HAMSTRINGS: 'Hamstrings',
    GLUTES: 'Glutes',
    ADDUCTORS: 'Adductors',
    ABDUCTORS: 'Abductors',
    CALVES: 'Calves',
    HIP_FLEXORS: 'Hip Flexors',
    NECK: 'Neck',
    FULL_BODY: 'Full Body',
    CARDIO: 'Cardio',
};

const MUSCLE_GROUPS = Object.values(MUSCLES);

const M = MUSCLES;

/* ------------------------------------------------------------- the equipment */

// What to call the thing in the user's hands, per catalog equipment value. The
// empty entries are the movements where naming an implement would be wrong --
// a push up holds nothing.
const IMPLEMENTS = {
    'Barbell': {noun: 'the barbell', hold: 'holding the barbell', plural: false},
    'Dumbbell': {noun: 'the dumbbells', hold: 'holding a dumbbell in each hand', plural: true},
    'Cable Machine': {noun: 'the cable handle', hold: 'holding the cable handle', plural: false},
    'Band': {noun: 'the band', hold: 'holding the band with the slack already taken up', plural: false},
    'Machines': {noun: 'the machine handles', hold: 'taking hold of the machine handles', plural: true},
    'TRX': {noun: 'the straps', hold: 'holding one strap handle in each hand', plural: true},
    'Bodyweight': {noun: 'your bodyweight', hold: '', plural: false},
    'Foam Roller': {noun: 'the foam roller', hold: 'with the foam roller under you', plural: false},
    'Stretching': {noun: '', hold: '', plural: false},
};

const DEFAULT_IMPLEMENT = {noun: 'the weight', hold: 'holding the weight', plural: false};

/* -------------------------------------------------------------- the grammar */

// Position words, longest first so "half kneeling" is not read as "kneeling".
// The key is what a rule's setup map is allowed to key on.
const POSITIONS = [
    {p: 'half kneeling', key: 'kneeling'},
    {p: 'bent over', key: 'bentOver'},
    {p: 'bent-over', key: 'bentOver'},
    {p: 'incline', key: 'incline'},
    {p: 'decline', key: 'decline'},
    {p: 'kneeling', key: 'kneeling'},
    {p: 'standing', key: 'standing'},
    {p: 'seated', key: 'seated'},
    {p: 'sitting', key: 'seated'},
    {p: 'lying', key: 'lying'},
    {p: 'prone', key: 'lying'},
    {p: 'supine', key: 'lying'},
    {p: 'floor', key: 'lying'},
    {p: 'hanging', key: 'hanging'},
    {p: 'preacher', key: 'preacher'},
    {p: 'wall', key: 'wall'},
];

// Grip words. These change which head of a muscle does the work often enough to
// be worth a cue line rather than being dropped.
const GRIPS = [
    {p: 'reverse grip', label: 'an overhand grip with your knuckles up', adds: [M.FOREARMS]},
    {p: 'neutral grip', label: 'a neutral grip with your palms facing each other', adds: []},
    {p: 'hammer grip', label: 'a neutral grip with your palms facing each other', adds: []},
    {p: 'parallel grip', label: 'a neutral grip with your palms facing each other', adds: []},
    {p: 'close grip', label: 'a narrow grip inside shoulder width', adds: []},
    {p: 'wide grip', label: 'a grip wider than your shoulders', adds: []},
    {p: 'underhand', label: 'an underhand grip with your palms up', adds: [M.BICEPS]},
    {p: 'supinated', label: 'an underhand grip with your palms up', adds: [M.BICEPS]},
    {p: 'overhand', label: 'an overhand grip with your palms down', adds: []},
    {p: 'pronated', label: 'an overhand grip with your palms down', adds: []},
    {p: 'palms up', label: 'your palms facing up', adds: []},
    {p: 'palms down', label: 'your palms facing down', adds: []},
];

// Cues that ride along with a word anywhere in the name.
const CUES = [
    {p: 'single arm', text: 'Work one arm at a time and give both sides the same number of reps.'},
    {p: 'one arm', text: 'Work one arm at a time and give both sides the same number of reps.'},
    {p: 'single leg', text: 'Work one leg at a time and give both sides the same number of reps.'},
    {p: 'one leg', text: 'Work one leg at a time and give both sides the same number of reps.'},
    {p: 'alternating', text: 'Alternate sides each rep, keeping your hips and shoulders square as you switch.'},
    {p: 'assisted', text: 'Use the least assistance that lets you finish the set with clean form, and reduce it as you get stronger.'},
    {p: 'deficit', text: 'The extra range from the deficit is the point, so only go as deep as you can hold position.'},
    {p: 'pause', text: 'Hold the hardest position for a full second before continuing.'},
    {p: 'tempo', text: 'Take the lowering phase slowly and under control.'},
    {p: 'pulse', text: 'Stay in the bottom range and move in short pulses without standing all the way up.'},
    {p: 'smith', text: 'The bar path is fixed, so set your feet where the machine wants them rather than fighting it.'},
    {p: 'behind back', text: 'Keep the bar close to your body and your wrists relaxed at the bottom.'},
    {p: 'behind neck', text: 'Only take the bar behind your head as far as your shoulder mobility allows.'},
];

// The rest between a hold and a rep, in words. Isometric movements get a hold
// cue instead of a rep cue.
const HOLD_CUE = 'Hold the position and breathe steadily rather than counting reps.';
const STRETCH_CUE = 'Ease into the stretch until you feel tension but no pain, and hold it for 20 to 30 seconds.';
const ROLL_CUE = 'Roll slowly, and when you find a tender spot pause on it until it eases.';

/* --------------------------------------------------------------- the rules */

// Each rule matches one or more movement phrases and supplies the muscles and
// the steps. `setup` is either one sentence or a map keyed by the position word
// found in the same name, with `default` as the fallback. `{hold}` and
// `{implement}` are replaced from the equipment.
//
// Rules are matched longest-phrase-first, so a specific rule always beats a
// general one that contains it: "straight arm lat pushdown" wins over
// "pushdown", "tricep kickback" over "kickback", "hip thrust" over "thrust".
const RULES = [

    /* ---------------------------------------------------------------- back */

    {
        p: ['bent over row', 'pendlay row', 'seal row', 'bent knee row', 'renegade row',
            'inverted row', 'linear row', 't-bar row', 'landmine row', 'yates row'],
        primary: M.LATS,
        secondary: [M.UPPER_BACK, M.REAR_DELTS, M.BICEPS],
        setup: {
            default: 'Hinge forward from your hips until your torso is close to parallel with the floor, {hold} with your arms hanging straight down.',
            seated: 'Sit tall with your feet braced and a small bend in your knees, {hold} at arms length.',
        },
        steps: [
            'Pull {implement} toward your lower ribs, driving your elbows back and squeezing your shoulder blades together at the top.',
            'Lower it under control until your arms are straight and you feel your lats stretch.',
            'Keep your back flat and your neck in line with your spine, and move the weight with your back rather than by swinging your body.',
        ],
    },
    {
        p: ['row'],
        primary: M.LATS,
        secondary: [M.UPPER_BACK, M.BICEPS],
        setup: {
            default: 'Set yourself square to the resistance, {hold} with your arms extended and your chest tall.',
            seated: 'Sit tall with your feet braced and a small bend in your knees, {hold} at arms length.',
            bentOver: 'Hinge forward from your hips with a flat back, {hold} with your arms hanging straight down.',
            standing: 'Stand tall with your feet hip-width apart and your core braced, {hold} at arms length.',
            kneeling: 'Kneel tall with your hips stacked over your knees, {hold} with your arms extended.',
        },
        steps: [
            'Pull {implement} toward your torso, leading with your elbows and drawing your shoulder blades together.',
            'Pause briefly with your elbows behind you, then return to the start under control until your arms are straight.',
            'Keep your shoulders down and away from your ears throughout, and do not let your torso rock to move the weight.',
        ],
    },
    {
        p: ['straight arm lat pushdown', 'straight arm pullover'],
        primary: M.LATS,
        secondary: [M.TRICEPS, M.ABS],
        setup: 'Stand a step back from the anchor and hinge slightly forward, {hold} with your arms straight and overhead.',
        steps: [
            'Keeping your elbows locked out, sweep your arms down in an arc until {implement} reaches your thighs.',
            'Feel your lats shorten at the bottom, then let your arms return overhead under control.',
            'Your elbows stay straight the whole time -- the moment they bend this turns into a triceps exercise.',
        ],
    },
    {
        p: ['lat pulldown', 'pulldown', 'hammer grip pulldown'],
        primary: M.LATS,
        secondary: [M.UPPER_BACK, M.BICEPS],
        setup: 'Sit with your thighs locked under the pads and your feet flat, {hold} above you with your arms fully extended.',
        steps: [
            'Pull {implement} down toward your upper chest, driving your elbows down and back.',
            'Squeeze your shoulder blades together at the bottom, then let it rise back up slowly until your arms are straight.',
            'Lean back only slightly and keep your chest lifted -- pulling with your whole body turns this into a row.',
        ],
    },
    {
        p: ['pull up', 'chin up', 'pull-up', 'chin-up'],
        primary: M.LATS,
        secondary: [M.UPPER_BACK, M.BICEPS, M.ABS],
        setup: 'Hang from the bar {grip}, with your arms straight and your shoulders pulled down away from your ears.',
        steps: [
            'Pull yourself up by driving your elbows down toward your ribs until your chin clears the bar.',
            'Lower yourself all the way down under control until your arms are straight again.',
            'Keep your core tight so your legs do not swing, and use the full range rather than short reps.',
        ],
    },
    {
        p: ['shrug'],
        primary: M.TRAPS,
        secondary: [M.FOREARMS],
        setup: 'Stand tall with your feet hip-width apart, {hold} at arms length by your sides.',
        steps: [
            'Lift your shoulders straight up toward your ears as high as they will go.',
            'Hold the top for a moment, then lower them all the way back down.',
            'Do not roll your shoulders -- the movement is straight up and straight down.',
        ],
    },
    {
        p: ['back extension lumbar focused', 'w back extension', 'y back extension', 'back extension'],
        primary: M.LOWER_BACK,
        secondary: [M.GLUTES, M.HAMSTRINGS],
        setup: 'Set yourself face down with your hips supported and your feet anchored, and let your torso hang down.',
        steps: [
            'Raise your torso by squeezing your glutes and lower back until your body forms a straight line.',
            'Pause at the top without arching past straight, then lower back down under control.',
            'Move slowly -- swinging up and bouncing at the bottom puts the load on your spine instead of your muscles.',
        ],
    },
    {
        p: ['hyperextension'],
        primary: M.GLUTES,
        secondary: [M.HAMSTRINGS, M.LOWER_BACK],
        setup: 'Lie face down with your hips at the edge of the bench and your upper body supported, legs hanging down.',
        steps: [
            'Squeeze your glutes to raise your legs until they are level with your torso.',
            'Hold the top briefly, then lower your legs under control.',
            'Keep the movement at your hips and do not arch your lower back to lift higher.',
        ],
    },
    {
        p: ['superman pull up'],
        primary: M.LATS,
        secondary: [M.UPPER_BACK, M.ABS],
        setup: 'Hang from the bar with your arms straight and your body already leaning back slightly.',
        steps: [
            'Pull up and drive your chest toward the bar while keeping your body long and straight.',
            'Lower under control back to a full hang.',
            'This is a harder pull up than it looks -- reduce the range before you let your form break.',
        ],
    },
    {
        p: ['superman', 'locust'],
        primary: M.LOWER_BACK,
        secondary: [M.GLUTES, M.UPPER_BACK],
        setup: 'Lie face down on the floor with your arms extended overhead and your legs straight.',
        steps: [
            'Lift your arms, chest and legs off the floor at the same time and hold for a second.',
            'Lower everything back down under control.',
            'Look at the floor rather than forward so your neck stays in line with your spine.',
        ],
    },
    {
        p: ['scapula push up'],
        primary: M.UPPER_BACK,
        secondary: [M.SHOULDERS],
        setup: 'Set up in a push up position with your arms straight and your body in a line.',
        steps: [
            'Without bending your elbows, let your chest sink slightly as your shoulder blades draw together.',
            'Push the floor away to spread your shoulder blades apart again.',
            'The range is small and your elbows stay locked -- this trains the muscles that move your shoulder blades.',
        ],
    },
    {
        p: ['face pull'],
        primary: M.REAR_DELTS,
        secondary: [M.UPPER_BACK, M.ROTATOR_CUFF],
        setup: 'Set the anchor at head height, step back until there is tension, and {hold} with your arms straight out in front.',
        steps: [
            'Pull toward your face, splitting your hands apart and driving your elbows high and wide.',
            'Finish with your hands beside your ears and your shoulder blades squeezed together, then return under control.',
            'Keep your elbows at or above the height of your hands throughout.',
        ],
    },

    /* --------------------------------------------------------------- chest */

    {
        p: ['bench press', 'chest press', 'hammer grip press', 'squeeze press', 'pec deck'],
        primary: M.CHEST,
        secondary: [M.TRICEPS, M.SHOULDERS],
        setup: {
            default: 'Lie back on the bench with your feet flat on the floor and your shoulder blades pulled together, {hold} above your chest.',
            incline: 'Lie back on the incline bench with your feet flat and your shoulder blades set, {hold} above your upper chest.',
            decline: 'Lie back on the decline bench with your legs secured and your shoulder blades set, {hold} above your lower chest.',
            seated: 'Sit back against the pad with your feet flat and your chest up, {hold} at chest height.',
            standing: 'Stand tall with one foot slightly forward for balance, {hold} at chest height with your elbows back.',
        },
        steps: [
            'Lower {implement} to your chest under control, keeping your elbows at roughly 45 degrees to your body.',
            'Press it back up and slightly toward your head until your arms are straight.',
            'Keep your wrists stacked over your elbows and your shoulder blades pulled together throughout.',
        ],
    },
    {
        p: ['floor press'],
        primary: M.TRICEPS,
        secondary: [M.CHEST, M.SHOULDERS],
        setup: 'Lie on your back on the floor with your knees bent and your feet flat, {hold} above your chest.',
        steps: [
            'Lower {implement} until the backs of your upper arms rest on the floor, keeping your elbows tucked.',
            'Pause for a moment on the floor, then press back up until your arms are straight.',
            'The floor stops the range short of a full stretch, which is the point -- it keeps the load off your shoulders and on your triceps.',
        ],
    },
    {
        p: ['crossover', 'chest fly', 'fly'],
        primary: M.CHEST,
        secondary: [M.SHOULDERS],
        setup: {
            default: 'Set yourself with your chest up and a soft bend in your elbows, {hold} out wide at chest height.',
            lying: 'Lie back on the bench with your feet flat, {hold} above your chest with a soft bend in your elbows.',
            incline: 'Lie back on the incline bench, {hold} above your chest with a soft bend in your elbows.',
            standing: 'Stand with one foot forward for balance and your chest up, {hold} out wide with a soft bend in your elbows.',
        },
        steps: [
            'Bring your hands together in a wide arc until they meet in front of your chest, squeezing your chest at the end.',
            'Open your arms back out slowly until you feel a stretch across your chest.',
            'Keep the bend in your elbows fixed the whole time -- if it opens and closes you are pressing, not flying.',
        ],
    },
    {
        p: ['diamond knee push up', 'diamond push up'],
        primary: M.TRICEPS,
        secondary: [M.CHEST, M.SHOULDERS],
        setup: 'Set up face down with your hands together under your chest so your index fingers and thumbs form a triangle.',
        steps: [
            'Lower your chest toward your hands, keeping your elbows tucked close to your ribs.',
            'Press back up until your arms are straight, holding your body in one line.',
            'The narrow hand position is what shifts the work to your triceps, so keep your elbows in rather than flaring them.',
        ],
    },
    {
        p: ['atomic push up', 'dead stop push up', 'dead-stop push up', 'knee push up',
            'pseudo planche push up', 'shoulder tap push up', 'push up', 'push-up'],
        primary: M.CHEST,
        secondary: [M.TRICEPS, M.SHOULDERS, M.ABS],
        setup: 'Set your hands slightly wider than your shoulders and hold your body in a straight line from head to heels.',
        steps: [
            'Lower your chest toward the floor by bending your elbows to about 45 degrees from your body.',
            'Press the floor away until your arms are straight again.',
            'Keep your hips level with your shoulders -- do not let them sag or pike up as you tire.',
        ],
    },
    {
        p: ['chest dip', 'dip bent knees', 'bent knees dip', 'dip'],
        primary: M.TRICEPS,
        secondary: [M.CHEST, M.SHOULDERS],
        setup: 'Support yourself on straight arms with your shoulders down and your body upright.',
        steps: [
            'Bend your elbows to lower yourself until your upper arms are roughly parallel with the floor.',
            'Press back up until your arms are straight.',
            'Leaning your torso forward moves the work to your chest, staying upright keeps it on your triceps.',
        ],
    },
    {
        p: ['pullover'],
        primary: M.CHEST,
        secondary: [M.LATS, M.TRICEPS],
        setup: 'Lie back on the bench with your feet flat and your ribs down, {hold} above your chest with your arms almost straight.',
        steps: [
            'Lower {implement} back over your head in an arc until you feel a stretch across your chest and lats.',
            'Pull it back over your chest along the same path.',
            'Keep your ribs pulled down so the movement happens at your shoulders and not by arching your back.',
        ],
    },

    /* ----------------------------------------------------------- shoulders */

    {
        p: ['shoulders hammer press', 'hammer grip shoulders press', 'shoulders press',
            'shoulder press', 'overhead press', 'military press', 'hammer press'],
        primary: M.SHOULDERS,
        secondary: [M.TRICEPS, M.UPPER_BACK],
        setup: {
            default: 'Set yourself tall with your core braced and your ribs down, {hold} at shoulder height.',
            seated: 'Sit tall against the pad with your feet flat and your core braced, {hold} at shoulder height.',
            standing: 'Stand with your feet hip-width apart and your glutes and core tight, {hold} at shoulder height.',
            kneeling: 'Kneel tall with your hips stacked over your knees and your core braced, {hold} at shoulder height.',
        },
        steps: [
            'Press {implement} straight overhead until your arms are locked out and your biceps are beside your ears.',
            'Lower back to shoulder height under control.',
            'Do not lean back to help the weight up -- keep your ribs down and your core tight throughout.',
        ],
    },
    {
        p: ['lateral raise', 'side raise'],
        primary: M.SHOULDERS,
        secondary: [M.TRAPS],
        setup: 'Stand tall with your feet hip-width apart, {hold} at your sides with a soft bend in your elbows.',
        steps: [
            'Raise your arms out to the sides until they are level with your shoulders.',
            'Pause at the top, then lower them slowly back to your sides.',
            'Lead with your elbows rather than your hands, and do not swing your body to start the rep.',
        ],
    },
    {
        p: ['front raise', 'shoulders raise', 'shoulder raise'],
        primary: M.SHOULDERS,
        secondary: [M.CHEST],
        setup: 'Stand tall with your feet hip-width apart, {hold} in front of your thighs with straight arms.',
        steps: [
            'Raise your arms straight out in front of you until they reach shoulder height.',
            'Lower them back down slowly under control.',
            'Keep your core braced so your torso does not rock backward as the weight comes up.',
        ],
    },
    {
        p: ['delt row', 'rear delt fly', 'reverse fly'],
        primary: M.REAR_DELTS,
        secondary: [M.UPPER_BACK, M.TRAPS],
        setup: 'Hinge forward from your hips with a flat back, {hold} hanging straight down below your chest.',
        steps: [
            'Pull your arms out and back with your elbows high and wide, squeezing your shoulder blades together.',
            'Lower under control until your arms hang straight again.',
            'Keep the weight light enough that your rear shoulders do the work rather than your lats.',
        ],
    },
    {
        p: ['upright row'],
        primary: M.SHOULDERS,
        secondary: [M.TRAPS, M.BICEPS],
        setup: 'Stand tall with your feet hip-width apart, {hold} in front of your thighs.',
        steps: [
            'Pull {implement} straight up along your body, leading with your elbows, until it reaches chest height.',
            'Lower it back down under control.',
            'Stop at chest height -- pulling higher pinches the shoulder joint for most people.',
        ],
    },
    {
        p: ['shoulder external rotation', 'external shoulder rotation', 'shoulder internal rotation',
            'internal shoulder rotation', 'shoulders rotation',
            'external rotation', 'internal rotation'],
        primary: M.ROTATOR_CUFF,
        secondary: [M.SHOULDERS],
        setup: 'Set your upper arm against your side or out at shoulder height with your elbow bent to 90 degrees, {hold}.',
        steps: [
            'Rotate your forearm around your elbow while keeping your upper arm exactly where it is.',
            'Return slowly to the start.',
            'This is a small muscle group -- use a light load and keep your elbow angle fixed at 90 degrees.',
        ],
    },
    {
        p: ['pike push up'],
        primary: M.SHOULDERS,
        secondary: [M.TRICEPS, M.UPPER_BACK],
        setup: 'Start in a push up position and walk your feet in so your hips are high and your body forms an inverted V.',
        steps: [
            'Bend your elbows to lower the top of your head toward the floor between your hands.',
            'Press back up until your arms are straight.',
            'The more vertical your torso is, the more of your bodyweight your shoulders take.',
        ],
    },
    {
        p: ['shoulder tap'],
        primary: M.ABS,
        secondary: [M.SHOULDERS],
        setup: 'Hold a push up position with your hands under your shoulders and your feet slightly wider than usual.',
        steps: [
            'Lift one hand and tap the opposite shoulder without letting your hips rotate.',
            'Return the hand to the floor and repeat on the other side.',
            'The point is to resist the twist -- move slowly enough that your hips stay level.',
        ],
    },
    {
        p: ['press jack'],
        primary: M.SHOULDERS,
        secondary: [M.CARDIO, M.QUADS],
        setup: 'Stand tall with your feet together, {hold} at shoulder height.',
        steps: [
            'Jump your feet out wide and press {implement} overhead at the same time.',
            'Jump your feet back together as you bring your hands back to your shoulders.',
            'Land softly through the balls of your feet and keep a rhythm you can sustain.',
        ],
    },

    /* ---------------------------------------------------------------- arms */

    {
        p: ['bayesian bicep curl', 'bayesian curl'],
        primary: M.BICEPS,
        secondary: [M.FOREARMS],
        setup: 'Stand facing away from a low anchor with your arm behind your body and the resistance already tight.',
        steps: [
            'Curl your hand up toward your shoulder while keeping your upper arm behind you.',
            'Lower slowly all the way until your arm is straight and your biceps are fully stretched.',
            'The stretched position is the whole point of this variation, so do not let your elbow drift forward.',
        ],
    },
    {
        p: ['cross body hammer curl', 'bicep hammer curl', 'hammer curl'],
        primary: M.BICEPS,
        secondary: [M.FOREARMS],
        setup: 'Stand tall with your elbows tucked at your sides, {hold} with your palms facing each other.',
        steps: [
            'Curl the weight up toward your shoulder while keeping your palms facing in the whole time.',
            'Lower it slowly until your arm is straight again.',
            'The neutral grip is what loads the outer arm and forearm, so do not let your wrist rotate.',
        ],
    },
    {
        p: ['drag curl'],
        primary: M.BICEPS,
        secondary: [],
        setup: 'Stand tall, {hold} at arms length in front of your thighs.',
        steps: [
            'Curl by dragging {implement} straight up your body while pulling your elbows back behind you.',
            'Lower it back down along the same path.',
            'The bar stays in contact with your body -- if it swings out in front you have lost the drag.',
        ],
    },
    {
        p: ['squatting bicep curl'],
        primary: M.BICEPS,
        secondary: [M.QUADS],
        setup: 'Drop into a quarter squat and hold that position, {hold} with your arms straight.',
        steps: [
            'Curl the weight up toward your shoulders without standing up out of the squat.',
            'Lower it back down under control, still holding the squat.',
            'Holding the low position is what stops you swinging the weight up with your hips.',
        ],
    },
    {
        p: ['reverse grip bicep curl', 'reverse curl', 'bicep curl', 'preacher curl',
            'spider curl', 'concentration curl', 'grip bicep curl', 'grip curl'],
        primary: M.BICEPS,
        secondary: [M.FOREARMS],
        setup: {
            default: 'Set yourself with your elbows fixed at your sides, {hold} with your arms straight and your palms facing up.',
            preacher: 'Sit at the preacher bench with the back of your upper arms flat against the pad, {hold} with your arms almost straight.',
            seated: 'Sit tall on the bench with your arms hanging at your sides, {hold} with your palms facing up.',
            standing: 'Stand tall with your elbows tucked at your sides, {hold} with your arms straight and your palms facing up.',
            incline: 'Lie back on the incline bench and let your arms hang straight down behind your body, {hold}.',
        },
        steps: [
            'Curl {implement} up toward your shoulders by bending only at the elbow.',
            'Squeeze at the top, then lower slowly until your arms are completely straight.',
            'Keep your upper arms still -- if your elbows travel forward your shoulders are taking the work.',
        ],
    },
    {
        p: ['curl'],
        primary: M.BICEPS,
        secondary: [M.FOREARMS],
        setup: 'Set yourself with your elbows fixed at your sides, {hold} with your arms straight.',
        steps: [
            'Curl {implement} up toward your shoulders by bending only at the elbow.',
            'Squeeze at the top, then lower slowly until your arms are straight again.',
            'Keep your upper arms still and your wrists neutral throughout.',
        ],
    },
    {
        p: ['pulley tricep extension', 'tricep extension', 'triceps extension', 'skull crusher'],
        primary: M.TRICEPS,
        secondary: [],
        setup: {
            default: 'Set your upper arms in position and keep them there, {hold} with your elbows bent.',
            lying: 'Lie back on the bench with your feet flat, {hold} above your chest with your arms straight.',
            seated: 'Sit tall with your core braced, {hold} overhead with your arms straight.',
            standing: 'Stand tall with your core braced, {hold} overhead with your arms straight.',
        },
        steps: [
            'Bend at the elbows to lower {implement} until you feel a stretch along the back of your arms.',
            'Extend your arms back to straight, squeezing your triceps at the top.',
            'Your upper arms stay locked in place -- only your forearms move.',
        ],
    },
    {
        p: ['grip tricep pushdown', 'tricep pushdown', 'triceps pushdown', 'pushdown'],
        primary: M.TRICEPS,
        secondary: [],
        setup: 'Stand facing the machine with your elbows tucked at your sides, {hold} at chest height.',
        steps: [
            'Push {implement} down until your arms are completely straight, squeezing your triceps at the bottom.',
            'Let it rise back to chest height under control without letting your elbows drift forward.',
            'Keep your torso upright -- leaning over the weight turns this into a whole-body push.',
        ],
    },
    {
        p: ['tricep kickback', 'triceps kickback'],
        primary: M.TRICEPS,
        secondary: [],
        setup: 'Hinge forward from your hips with a flat back and tuck your upper arm against your side, {hold}.',
        steps: [
            'Straighten your arm behind you until it is in line with your torso, squeezing your triceps.',
            'Bend your elbow to return to the start under control.',
            'Your upper arm stays glued to your side for every rep.',
        ],
    },
    {
        p: ['neutral wrist curl', 'wrist curl'],
        primary: M.FOREARMS,
        secondary: [],
        setup: 'Rest your forearms on your thighs or a bench with your wrists hanging past the edge, {hold}.',
        steps: [
            'Let your wrists roll open, then curl them up as far as they will go.',
            'Lower back down slowly through the full range.',
            'Only your wrists move -- keep your forearms flat on the support throughout.',
        ],
    },
    {
        p: ['radial deviation', 'ulnar deviation'],
        primary: M.FOREARMS,
        secondary: [],
        setup: 'Stand or sit with your arm at your side and your wrist neutral, {hold}.',
        steps: [
            'Move your hand toward one side by bending only at the wrist.',
            'Return slowly to neutral.',
            'The range is short and the load should be light -- this is a wrist exercise, not an arm exercise.',
        ],
    },
    {
        p: ['body saw'],
        primary: M.ABS,
        secondary: [M.SHOULDERS],
        setup: 'Set up in a forearm plank with your feet on sliders or straps.',
        steps: [
            'Push through your forearms to slide your body backward without letting your hips drop.',
            'Pull yourself forward again to the starting position.',
            'The further back you slide the harder it gets, so keep the range where your back stays flat.',
        ],
    },

    /* ---------------------------------------------------------------- legs */

    {
        p: ['hack good morning', 'good morning'],
        primary: M.HAMSTRINGS,
        secondary: [M.GLUTES, M.LOWER_BACK],
        setup: 'Stand with your feet hip-width apart and a soft bend in your knees, {hold} across your upper back.',
        steps: [
            'Push your hips straight back and let your torso lower until you feel a strong stretch in your hamstrings.',
            'Drive your hips forward to stand back up, squeezing your glutes at the top.',
            'Your back stays flat the whole way -- stop the descent when it starts to round, not when you reach parallel.',
        ],
    },
    {
        p: ['romanian deadlift', 'stiff leg deadlift', 'single deadlift', 'deadlift row',
            'block deadlift', 'sumo deadlift', 'deadlift'],
        primary: M.HAMSTRINGS,
        secondary: [M.GLUTES, M.LOWER_BACK, M.TRAPS],
        setup: 'Stand with your feet hip-width apart and {implement} close to your shins, and set your back flat with your chest up.',
        steps: [
            'Push your hips back and hinge forward, keeping {implement} in contact with your legs as it travels down.',
            'Drive through your whole foot and push your hips forward to stand tall, squeezing your glutes at the top.',
            'Keep your shoulders pulled back and the bar close -- letting it drift away from your legs is what rounds your back.',
        ],
    },
    {
        p: ['hack squat', 'belt squat', 'pendulum squat', 'zercher squat', 'goblet squat',
            'front squat', 'back squat', 'air squat', 'bench squat', 'skater squat', 'squat'],
        primary: M.QUADS,
        secondary: [M.GLUTES, M.HAMSTRINGS, M.ABS],
        setup: {
            default: 'Stand with your feet about shoulder-width apart and your toes turned slightly out, {hold} and your core braced.',
            wall: 'Set your back flat against the wall and walk your feet out until your knees will bend to 90 degrees.',
        },
        steps: [
            'Push your hips back and bend your knees to lower yourself until your thighs are at least parallel with the floor.',
            'Drive through your whole foot to stand back up, keeping your chest tall.',
            'Track your knees out over your toes and keep your heels down throughout.',
        ],
    },
    {
        p: ['pistol squat'],
        primary: M.QUADS,
        secondary: [M.GLUTES, M.ABS],
        setup: 'Stand on one leg with the other leg held straight out in front of you.',
        steps: [
            'Lower yourself down on the standing leg as far as you can while keeping the other leg off the floor.',
            'Drive back up to standing on the same leg.',
            'Hold something light for balance until you can do this unsupported -- balance fails long before strength does.',
        ],
    },
    {
        p: ['wall sit'],
        primary: M.QUADS,
        secondary: [M.GLUTES],
        setup: 'Set your back flat against the wall and walk your feet out, then slide down until your knees are bent to 90 degrees.',
        steps: [
            'Hold the position with your thighs parallel to the floor and your weight through your heels.',
            'Keep your back flat against the wall and your knees over your ankles.',
            HOLD_CUE,
        ],
        isHold: true,
    },
    {
        p: ['back lunge', 'reverse lunge', 'forward lunge', 'side lunge', 'split squat',
            'leg lunge', 'lunges', 'lunge'],
        primary: M.QUADS,
        secondary: [M.GLUTES, M.HAMSTRINGS],
        setup: 'Stand tall with your feet hip-width apart and your core braced, {hold} at your sides.',
        steps: [
            'Take a long step and lower your back knee toward the floor until both knees are bent to about 90 degrees.',
            'Push through your front foot to return to standing.',
            'Keep your torso upright and your front knee tracking over your foot rather than collapsing inward.',
        ],
    },
    {
        p: ['step up knee drive', 'step up'],
        primary: M.QUADS,
        secondary: [M.GLUTES, M.HAMSTRINGS],
        setup: 'Stand facing a box or bench at about knee height, {hold} at your sides.',
        steps: [
            'Place one whole foot on the box and drive through that heel to stand up on top.',
            'Lower yourself back down under control with the same leg.',
            'Do not push off the trailing foot -- the working leg should do all of it.',
        ],
    },
    {
        p: ['leg press calf raise', 'horizontal leg press calf raise', 'donkey calf raise', 'calf raise'],
        primary: M.CALVES,
        secondary: [],
        setup: {
            default: 'Set the balls of your feet on the platform or step with your heels free to drop below them.',
            seated: 'Sit with the pad across your thighs and the balls of your feet on the platform.',
        },
        steps: [
            'Push through the balls of your feet to raise your heels as high as they will go.',
            'Hold the top for a moment, then lower your heels slowly below the platform until you feel a stretch.',
            'Use the full range in both directions -- short bouncy reps do almost nothing here.',
        ],
    },
    {
        p: ['horizontal leg press', 'horizontal press', 'leg press'],
        primary: M.QUADS,
        secondary: [M.GLUTES, M.HAMSTRINGS],
        setup: 'Sit back into the seat with your feet flat on the platform about shoulder-width apart.',
        steps: [
            'Bend your knees to bring the platform toward you until your knees are at about 90 degrees.',
            'Press it away until your legs are almost straight, without locking your knees hard.',
            'Keep your lower back flat against the seat -- if your hips curl up you have gone too deep.',
        ],
    },
    {
        p: ['hamstring runner', 'hamstring curl', 'leg curl'],
        primary: M.HAMSTRINGS,
        secondary: [M.CALVES],
        setup: {
            default: 'Set yourself against the machine with the pad just above your heels and your hips flat.',
            lying: 'Lie face down with the pad resting just above your heels and your hips pressed into the bench.',
            seated: 'Sit back with the pad across your shins and the thigh pad locked down.',
        },
        steps: [
            'Curl your heels toward your glutes as far as the range allows.',
            'Squeeze at the top, then lower slowly until your legs are almost straight.',
            'Keep your hips down throughout -- lifting them off the pad shortens the movement.',
        ],
    },
    {
        p: ['leg extension', 'extension'],
        primary: M.QUADS,
        secondary: [],
        setup: 'Sit back in the seat with the pad resting on the front of your ankles and your thighs supported.',
        steps: [
            'Straighten your legs until they are fully extended, squeezing your quads at the top.',
            'Lower slowly back to the start under control.',
            'Do not swing the weight up or let it drop -- the lowering half is where most of the work is.',
        ],
    },
    {
        p: ['hip thrust', 'glute bridge march', 'glute bridge', 'tabletop hold with bent knee lift',
            'tabletop hold', 'tabletop bridge bent knee lift',
            'tabletop bridge', 'tabletop bent knee lift', 'bridge'],
        primary: M.GLUTES,
        secondary: [M.HAMSTRINGS, M.ABS],
        setup: 'Lie on your back with your knees bent and your feet flat, about a foot from your hips.',
        steps: [
            'Drive through your heels to lift your hips until your body forms a straight line from knees to shoulders.',
            'Squeeze your glutes hard at the top, then lower your hips back down under control.',
            'Push your ribs down and keep your chin tucked so the lift comes from your glutes, not from arching your back.',
        ],
    },
    {
        p: ['donkey kick pulse', 'donkey kickback', 'donkey kick', 'glute kickback', 'hip glute kickback'],
        primary: M.GLUTES,
        secondary: [M.HAMSTRINGS],
        setup: 'Set up on your hands and knees with your back flat and your core braced.',
        steps: [
            'Drive one heel up toward the ceiling, keeping that knee bent to 90 degrees.',
            'Lower it back down without letting it touch the floor, then repeat.',
            'Do not let your lower back arch to get the leg higher -- stop where your hips stay square.',
        ],
    },
    {
        p: ['fire hydrant', 'clamshell'],
        primary: M.ABDUCTORS,
        secondary: [M.GLUTES],
        setup: 'Set up on your hands and knees, or on your side with your knees stacked and bent.',
        steps: [
            'Open your top knee away from the other one as far as it will go without rolling your hips back.',
            'Lower it back under control.',
            'Keep your hips stacked and square -- rolling backward is how this stops working the glutes.',
        ],
    },
    {
        p: ['rolling hip abduction', 'rolling hip abductor', 'hip thigh abduction',
            'hip abduction support', 'plank hip abduction', 'hip abduction'],
        primary: M.ABDUCTORS,
        secondary: [M.GLUTES],
        setup: 'Set yourself square with the resistance pulling your leg inward, and brace your core.',
        steps: [
            'Move your leg out away from the midline of your body as far as it will comfortably go.',
            'Return slowly to the start against the resistance.',
            'Keep your torso upright and still -- leaning away is how you cheat this one.',
        ],
    },
    {
        p: ['rolling hip adduction', 'rolling hip adductor', 'hip thigh adduction',
            'hip adduction support', 'hip adduction'],
        primary: M.ADDUCTORS,
        secondary: [],
        setup: 'Set yourself square with the resistance pulling your leg outward, and brace your core.',
        steps: [
            'Pull your leg in across the midline of your body against the resistance.',
            'Let it travel back out slowly under control.',
            'Keep your hips level and your torso still throughout.',
        ],
    },
    {
        p: ['hip extension'],
        primary: M.GLUTES,
        secondary: [M.HAMSTRINGS],
        setup: 'Set yourself square to the machine with your working leg forward and your core braced.',
        steps: [
            'Drive your leg back behind you until your hip is fully extended, squeezing your glute.',
            'Return under control without letting your back arch.',
            'The movement happens at your hip -- your lower back should not move at all.',
        ],
    },
    {
        p: ['hip flexion'],
        primary: M.HIP_FLEXORS,
        secondary: [M.ABS],
        setup: 'Stand tall facing away from the anchor with your core braced and your working leg back.',
        steps: [
            'Drive your knee up in front of you until your thigh is at least parallel with the floor.',
            'Lower it back down slowly against the resistance.',
            'Stand tall throughout rather than leaning back to lift the knee higher.',
        ],
    },
    {
        p: ['pull through'],
        primary: M.GLUTES,
        secondary: [M.HAMSTRINGS, M.LOWER_BACK],
        setup: 'Face away from a low anchor with the handle between your legs, feet slightly wider than your hips.',
        steps: [
            'Hinge at your hips and let the handle travel back between your legs until you feel your hamstrings stretch.',
            'Drive your hips forward to stand tall, squeezing your glutes hard at the top.',
            'This is a hip hinge, not a squat -- your knees stay mostly where they are.',
        ],
    },
    {
        p: ['squat calf raise', 'squat pulse', 'squat press', 'squat row'],
        primary: M.QUADS,
        secondary: [M.GLUTES, M.SHOULDERS],
        setup: 'Stand with your feet about shoulder-width apart and your core braced, {hold}.',
        steps: [
            'Squat down until your thighs are at least parallel with the floor.',
            'Drive back up and finish the second half of the movement in one continuous effort.',
            'Let the legs start the movement and the upper body finish it rather than doing the two separately.',
        ],
    },
    {
        p: ['l sit leg raise', 'plank leg raise'],
        primary: M.ABS,
        secondary: [M.HIP_FLEXORS, M.QUADS],
        setup: 'Hold a supported position with your body long and your core already braced.',
        steps: [
            'Lift one leg without letting your hips drop or rotate.',
            'Lower it under control and repeat with the other leg.',
            'Keep your hips level -- the anti-rotation work is what makes this a core exercise.',
        ],
    },

    /* ---------------------------------------------------------------- core */

    {
        p: ['ab rollout', 'rollout'],
        primary: M.ABS,
        secondary: [M.LATS, M.SHOULDERS],
        setup: 'Kneel on the floor holding the wheel or bar under your shoulders with your arms straight.',
        steps: [
            'Roll forward slowly, letting your body extend while keeping your hips and ribs locked together.',
            'Go only as far as you can keep your lower back flat, then pull yourself back to the start.',
            'The moment your lower back starts to arch you have gone too far -- shorten the range rather than pushing it.',
        ],
    },
    {
        p: ['bicycle crunch', 'boat bicycle', 'bicycle'],
        primary: M.OBLIQUES,
        secondary: [M.ABS, M.HIP_FLEXORS],
        setup: 'Lie on your back with your hands beside your head and your legs lifted with knees bent.',
        steps: [
            'Bring one knee in while rotating your opposite shoulder toward it, and extend the other leg out straight.',
            'Switch sides in a controlled, continuous rhythm.',
            'Rotate from your ribs rather than pulling on your neck with your hands.',
        ],
    },
    {
        p: ['vertical leg crunch', 'leg vertical crunch', 'reverse crunch', 'crunch knee raise',
            'crunches hip raise', 'crunches', 'crunch'],
        primary: M.ABS,
        secondary: [M.HIP_FLEXORS],
        setup: 'Lie on your back with your lower back pressed into the floor and your hands beside your head.',
        steps: [
            'Curl your shoulders off the floor by shortening the distance between your ribs and your hips.',
            'Lower back down slowly under control without letting your head touch down and rest.',
            'The range is short -- this is a curl of your spine, not a sit up.',
        ],
    },
    {
        p: ['sit up press', 'sit-up', 'sit up'],
        primary: M.ABS,
        secondary: [M.HIP_FLEXORS],
        setup: 'Lie on your back with your knees bent and your feet flat or anchored.',
        steps: [
            'Curl your torso up off the floor one vertebra at a time until you are sitting upright.',
            'Lower yourself back down under control rather than dropping.',
            'Keep your chin off your chest and lead with your ribs, not your head.',
        ],
    },
    {
        p: ['captains chair knee raise', 'captains chair leg raise', 'bent knee hip raise',
            'straight leg hip raise', 'leg raise hip lift', 'knee raise', 'leg raise'],
        primary: M.ABS,
        secondary: [M.HIP_FLEXORS, M.OBLIQUES],
        setup: 'Support yourself with your back flat and your legs hanging straight down.',
        steps: [
            'Raise your legs in front of you, curling your hips up at the top rather than stopping at 90 degrees.',
            'Lower them back down slowly without swinging.',
            'The hip curl at the top is what makes your abs work instead of just your hip flexors.',
        ],
    },
    {
        p: ['toes to bar', 'toes bar'],
        primary: M.ABS,
        secondary: [M.LATS, M.HIP_FLEXORS],
        setup: 'Hang from the bar with your shoulders pulled down and your body still.',
        steps: [
            'Curl your hips up and lift your legs until your toes touch the bar.',
            'Lower them back to a full hang under control.',
            'Keep the swing out of it -- if you need momentum, work with bent knees until you do not.',
        ],
    },
    {
        p: ['diagonal plank', 'running plank', 'plank lunge', 'plank'],
        primary: M.ABS,
        secondary: [M.SHOULDERS, M.GLUTES],
        setup: 'Set up on your forearms or hands with your body in a straight line from head to heels.',
        steps: [
            'Brace your abs, squeeze your glutes and hold the line without letting your hips sag or pike.',
            'Breathe steadily rather than holding your breath.',
            HOLD_CUE,
        ],
        isHold: true,
    },
    {
        p: ['side bridges', 'side bridge', 'bridges'],
        primary: M.OBLIQUES,
        secondary: [M.ABS, M.SHOULDERS],
        setup: 'Lie on your side propped on one forearm with your feet stacked.',
        steps: [
            'Lift your hips until your body forms a straight line from head to feet.',
            'Hold the position, then lower under control.',
            'Do not let your top shoulder roll forward -- keep your chest open.',
        ],
        isHold: true,
    },
    {
        p: ['dead bug leg lowering', 'dead bug'],
        primary: M.ABS,
        secondary: [M.HIP_FLEXORS],
        setup: 'Lie on your back with your arms straight up and your knees bent over your hips.',
        steps: [
            'Lower one arm overhead and the opposite leg toward the floor at the same time.',
            'Return to the start and repeat on the other side.',
            'Keep your lower back pressed into the floor -- if it lifts, reduce how far you reach.',
        ],
    },
    {
        p: ['bird dog'],
        primary: M.ABS,
        secondary: [M.LOWER_BACK, M.GLUTES],
        setup: 'Set up on your hands and knees with your back flat.',
        steps: [
            'Extend one arm forward and the opposite leg back until both are in line with your torso.',
            'Hold briefly, return, then switch sides.',
            'Keep your hips level throughout -- imagine balancing a glass of water on your lower back.',
        ],
    },
    {
        p: ['mountain climber'],
        primary: M.ABS,
        secondary: [M.CARDIO, M.SHOULDERS],
        setup: 'Start in a push up position with your hands under your shoulders and your body in a line.',
        steps: [
            'Drive one knee toward your chest, then switch legs in a running rhythm.',
            'Keep your hips low and level rather than letting them bounce up.',
            'Your shoulders stay stacked over your hands the whole time.',
        ],
    },
    {
        p: ['flutter kicks', 'boat hold leg flutters', 'boat hold', 'boat leg flutters'],
        primary: M.ABS,
        secondary: [M.HIP_FLEXORS],
        setup: 'Lie on your back with your legs straight and lifted a few inches off the floor.',
        steps: [
            'Kick your legs up and down in small alternating movements without letting your heels touch down.',
            'Keep your lower back pressed into the floor throughout.',
            'If your back lifts off the floor, raise your legs higher until it does not.',
        ],
    },
    {
        p: ['cocoons', 'cocoon'],
        primary: M.ABS,
        secondary: [M.HIP_FLEXORS, M.OBLIQUES],
        setup: 'Lie flat on your back with your arms extended overhead and your legs straight.',
        steps: [
            'Pull your knees toward your chest and swing your arms forward at the same time, curling into a ball.',
            'Extend back out until you are flat and long again.',
            'Move as one piece -- everything arrives at the middle at the same time.',
        ],
    },
    {
        p: ['crab toe touches'],
        primary: M.ABS,
        secondary: [M.GLUTES, M.SHOULDERS],
        setup: 'Sit with your hands behind you and your feet flat, then lift your hips into a tabletop position.',
        steps: [
            'Kick one leg up and reach the opposite hand toward that foot.',
            'Return to tabletop and repeat on the other side.',
            'Keep your hips up between reps rather than sitting back down.',
        ],
    },
    {
        p: ['knee tuck', 'tuck knee', 'pike'],
        primary: M.ABS,
        secondary: [M.HIP_FLEXORS, M.SHOULDERS],
        setup: 'Set your feet in the straps or on the ball and hold a strong plank position on your hands.',
        steps: [
            'Pull your knees or hips in toward your chest, letting your hips rise.',
            'Extend back out slowly to the plank without letting your hips sag.',
            'The return is the hard part -- control it rather than dropping back out.',
        ],
    },
    {
        p: ['side bend', 'bend'],
        primary: M.OBLIQUES,
        secondary: [M.LOWER_BACK],
        setup: 'Stand tall with your feet hip-width apart, {hold} at one side.',
        steps: [
            'Bend sideways at the waist, lowering the weight down your leg as far as it comfortably goes.',
            'Pull yourself back upright using the muscles on the opposite side.',
            'Move straight sideways -- do not lean forward or twist as you bend.',
        ],
    },
    {
        p: ['wipers'],
        primary: M.OBLIQUES,
        secondary: [M.ABS],
        setup: 'Lie on your back with your arms out wide and your legs lifted straight over your hips.',
        steps: [
            'Lower your legs together to one side, stopping before your shoulder lifts off the floor.',
            'Bring them back to centre and repeat on the other side.',
            'Keep both shoulders pinned down -- that is what forces your obliques to control the movement.',
        ],
    },
    {
        p: ['v up'],
        primary: M.ABS,
        secondary: [M.HIP_FLEXORS],
        setup: 'Lie flat on your back with your arms overhead and your legs straight.',
        steps: [
            'Lift your legs and torso at the same time and reach your hands toward your feet, forming a V.',
            'Lower back down under control until you are flat again.',
            'If you cannot keep your legs straight, bend your knees rather than jerking up off the floor.',
        ],
    },

    /* ------------------------------------------------------------- cardio */

    {
        p: ['burpee push up', 'burpee push-up', 'burpee no', 'burpee'],
        primary: M.CARDIO,
        secondary: [M.QUADS, M.CHEST, M.ABS],
        setup: 'Stand with your feet hip-width apart and a clear space in front of you.',
        steps: [
            'Drop your hands to the floor and jump your feet back into a push up position.',
            'Jump your feet back in under your hips and stand or jump up to finish the rep.',
            'Land softly and keep your back flat as you go down and come back up.',
        ],
    },
    {
        p: ['jumping jack', 'simplified jumping jack', 'plank jack', 'side jack',
            'leg raise jack', 'jack'],
        primary: M.CARDIO,
        secondary: [M.SHOULDERS, M.ABDUCTORS],
        setup: 'Stand tall with your feet together and your arms at your sides.',
        steps: [
            'Jump your feet out wide while raising your arms out and overhead.',
            'Jump back to the starting position and repeat in a steady rhythm.',
            'Land through the balls of your feet with soft knees.',
        ],
    },
    {
        p: ['plyo clap push up', 'plyo knee push up', 'plyo push up'],
        primary: M.CHEST,
        secondary: [M.CARDIO, M.TRICEPS, M.SHOULDERS],
        setup: 'Set up in a push up position with your body in a straight line.',
        steps: [
            'Lower your chest under control, then push explosively so your hands leave the floor.',
            'Land with soft elbows and go straight into the next rep.',
            'Stop the set as soon as you stop leaving the floor -- the speed is the point of this one.',
        ],
    },
    {
        p: ['jumping lunges', 'squat jumps', 'plank frog', 'lunge knee drive', 'squat kicks',
            'bulgarian split jump', 'split jump'],
        primary: M.CARDIO,
        secondary: [M.QUADS, M.GLUTES],
        setup: 'Stand with your feet hip-width apart and your core braced.',
        steps: [
            'Drive explosively into the jump, using your arms to help.',
            'Land softly through your whole foot with your knees bent and go straight into the next rep.',
            'Keep your chest up on landing -- this gets sloppy fast when you are tired.',
        ],
    },
    {
        p: ['high knee taps', 'knee taps', 'butt kicks', 'running in place punches',
            'running in place', 'front kicks', 'kicks', 'punches'],
        primary: M.CARDIO,
        secondary: [M.QUADS, M.ABS],
        setup: 'Stand tall with your feet hip-width apart and your weight on the balls of your feet.',
        steps: [
            'Move at a quick, steady pace, staying light on your feet.',
            'Keep your core braced and your chest up rather than hunching forward.',
            'Pick a pace you can hold for the whole interval rather than sprinting the first ten seconds.',
        ],
    },
    {
        p: ['treadmill running', 'running treadmill', 'running', 'skipping', 'jump rope'],
        primary: M.CARDIO,
        secondary: [M.QUADS, M.CALVES, M.HAMSTRINGS],
        setup: 'Start at an easy pace for a minute or two before working up to your target effort.',
        steps: [
            'Keep your posture tall, your shoulders relaxed and your arms swinging from the shoulder.',
            'Land under your body rather than reaching out in front with your heel.',
            'Ease off gradually at the end rather than stopping dead.',
        ],
    },
    {
        p: ['treadmill walking', 'walking treadmill', 'walking'],
        primary: M.CARDIO,
        secondary: [M.QUADS, M.CALVES],
        setup: 'Set a pace brisk enough that talking takes a little effort.',
        steps: [
            'Walk tall with your shoulders back and your steps rolling heel to toe.',
            'Let your arms swing naturally rather than holding the rails.',
            'Add incline rather than speed if you want it harder without running.',
        ],
    },
    {
        p: ['stationary bike run', 'stationary bike', 'air bike', 'elliptical', 'rowing', 'stepper'],
        primary: M.CARDIO,
        secondary: [M.QUADS, M.HAMSTRINGS, M.GLUTES],
        setup: 'Set the machine up for your height before you start, and begin with an easy warm up.',
        steps: [
            'Settle into a steady rhythm at a resistance you can hold for the whole effort.',
            'Keep your posture tall and your movement smooth rather than jerky.',
            'Finish with a couple of easy minutes rather than stopping abruptly.',
        ],
    },
    {
        p: ['swing'],
        primary: M.GLUTES,
        secondary: [M.HAMSTRINGS, M.CARDIO, M.LOWER_BACK],
        setup: 'Stand with your feet slightly wider than your hips and {implement} on the floor in front of you.',
        steps: [
            'Hinge at your hips and hike the weight back between your legs.',
            'Snap your hips forward to swing it up to chest height, then let it fall back into the next rep.',
            'This is a hip hinge, not a squat, and not a front raise -- your arms just hold on.',
        ],
    },

    /* --------------------------------------------------- stretching + rolling */

    {
        p: ['stretching', 'stretch', 'pose', 'cat cow', 'downward facing dog', 'upward facing dog',
            'spinal twist', 'knees chest', 'single knee chest', 'knee chest', 'lower trunk rotation',
            'spinal extension bending', 'spinal flexion bending', 'bending hands behind',
            'round back', 'side tilt', 'tilt', 'leg swings'],
        primary: M.FULL_BODY,
        secondary: [],
        setup: 'Move into the position slowly until you feel a gentle stretch, and keep breathing.',
        steps: [
            'Hold the position steadily rather than bouncing in and out of it.',
            'Relax into it a little further on each exhale as the tension eases.',
            STRETCH_CUE,
        ],
        isStretch: true,
    },
    {
        p: ['rolling'],
        primary: M.FULL_BODY,
        secondary: [],
        setup: 'Place the roller under the muscle you are working on and support some of your weight with your hands or feet.',
        steps: [
            'Roll slowly along the length of the muscle, covering the whole area.',
            'Adjust how much weight you put through the roller to control the pressure.',
            ROLL_CUE,
        ],
        isStretch: true,
    },
];

/* --------------------------------------------------- stretch and roll targets */

// Stretching and foam rolling names say exactly which muscle they target, and
// the catalog files them all under UPPER BODY or LOWER BODY. This recovers the
// real target, so "Rolling Hamstring" charts as Hamstrings rather than as an
// undifferentiated slice.
const BODY_PART_HINTS = [
    {p: 'tibialis anterior', muscle: M.CALVES},
    {p: 'tibalis anterior', muscle: M.CALVES},
    {p: 'rear deltoid', muscle: M.REAR_DELTS},
    {p: 'middle deltoid', muscle: M.SHOULDERS},
    {p: 'front deltoid', muscle: M.SHOULDERS},
    {p: 'deltoid', muscle: M.SHOULDERS},
    {p: 'latissimus', muscle: M.LATS},
    {p: 'quadricep', muscle: M.QUADS},
    {p: 'hamstring', muscle: M.HAMSTRINGS},
    {p: 'brachialis', muscle: M.BICEPS},
    {p: 'trapezius', muscle: M.TRAPS},
    {p: 'hip flexor', muscle: M.HIP_FLEXORS},
    {p: 'hip abduct', muscle: M.ABDUCTORS},
    {p: 'hip adduct', muscle: M.ADDUCTORS},
    {p: 'achilles', muscle: M.CALVES},
    {p: 'upper back', muscle: M.UPPER_BACK},
    {p: 'lower back', muscle: M.LOWER_BACK},
    {p: 'forearm', muscle: M.FOREARMS},
    {p: 'glute', muscle: M.GLUTES},
    {p: 'calves', muscle: M.CALVES},
    {p: 'calf', muscle: M.CALVES},
    {p: 'tricep', muscle: M.TRICEPS},
    {p: 'bicep', muscle: M.BICEPS},
    {p: 'shoulder', muscle: M.SHOULDERS},
    {p: 'chest', muscle: M.CHEST},
    {p: 'neck', muscle: M.NECK},
    {p: 'lats', muscle: M.LATS},
    {p: 'lat', muscle: M.LATS},
    {p: 'groin', muscle: M.ADDUCTORS},
    {p: 'adductor', muscle: M.ADDUCTORS},
    {p: 'abductor', muscle: M.ABDUCTORS},
    {p: 'spine', muscle: M.LOWER_BACK},
    {p: 'spinal', muscle: M.LOWER_BACK},
    {p: 'back', muscle: M.LOWER_BACK},
];

// The last resort: the catalog's own coarse value. Only reached by a name that
// matched no rule at all, which the seeder counts and reports rather than
// letting it pass silently.
const COARSE_FALLBACK = {
    'ABS': {primary: M.ABS, secondary: [M.OBLIQUES]},
    'ARMS': {primary: M.BICEPS, secondary: [M.TRICEPS, M.FOREARMS]},
    'ARMS and SHOULDERS': {primary: M.SHOULDERS, secondary: [M.TRICEPS]},
    'BACK': {primary: M.LATS, secondary: [M.UPPER_BACK]},
    'CARDIO': {primary: M.CARDIO, secondary: []},
    'CHEST': {primary: M.CHEST, secondary: [M.TRICEPS]},
    'LEGS': {primary: M.QUADS, secondary: [M.GLUTES, M.HAMSTRINGS]},
    'LOWER BODY': {primary: M.FULL_BODY, secondary: []},
    'SHOULDERS': {primary: M.SHOULDERS, secondary: [M.TRAPS]},
    'UPPER BODY': {primary: M.FULL_BODY, secondary: []},
};

/* ------------------------------------------------------------- the matching */

// "Barbell Bench Palms Down/Up Wrist Curl (side view)" -> a plain lowercase
// token stream, with the parenthetical camera note dropped. The pad on both
// ends lets every phrase test be a whole-word test without a regex.
const normalise = (name) => ` ${String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;

const has = (haystack, phrase) => haystack.includes(` ${phrase} `);

// Longest phrase wins, so a rule listing "tricep pushdown" always beats the one
// listing "pushdown" no matter what order they were written in. Precomputed
// once at load rather than per lookup: the seeder calls this 1,603 times.
const INDEXED = RULES
    .flatMap((rule) => rule.p.map((phrase) => ({phrase, rule})))
    .sort((a, b) => b.phrase.length - a.phrase.length);

const findRule = (normalised) => {
    const hit = INDEXED.find((entry) => has(normalised, entry.phrase));
    return hit ? hit.rule : null;
};

const findPosition = (normalised) => {
    const hit = POSITIONS.find((entry) => has(normalised, entry.p));
    return hit ? hit.key : null;
};

const findGrip = (normalised) => GRIPS.find((entry) => has(normalised, entry.p)) || null;

// Longest hint first so "lower back" beats "back" and "rear deltoid" beats
// "deltoid", regardless of the order they happen to be written in above.
const HINTS = [...BODY_PART_HINTS].sort((a, b) => b.p.length - a.p.length);

// The catalog writes both "Rolling Quadricep" and "Quadriceps Stretching", so a
// whole-word test on the singular alone misses half of them. Allowing the
// plural is enough -- loosening this to a substring match would find "lat"
// inside "lateral" and file every lateral raise under Lats.
const findBodyPart = (normalised) => {
    const hit = HINTS.find((entry) => has(normalised, entry.p) || has(normalised, `${entry.p}s`));
    return hit ? hit.muscle : null;
};

// A bodyweight movement holds nothing, so {hold} renders to nothing and the
// sentence has to close over the gap it leaves. "Sit at the preacher bench...,
// {hold} with your arms almost straight" has to become "..., with your arms
// almost straight" rather than keeping a dangling comma or inventing an
// implement that is not there.
// The clause and the comma that introduced it go together. Dropping only the
// placeholder leaves "...slightly out, and your core braced", so the comma is
// matched as part of the placeholder rather than cleaned up globally afterward
// -- a global comma rule would also eat the commas in the authored sentences.
const joinHold = (template, hold) => (hold
    ? template.split('{hold}').join(hold)
    : template
        .replace(/,?\s*\{hold\}\s+and\b/g, ' and')
        // "at your sides", "above your chest" say where the implement is, so
        // they leave with it. "with your arms straight" describes the lifter
        // and stays behind.
        .replace(/,?\s*\{hold\}(?:\s+(?:at|above|overhead|in front of|out|across|hanging|between|below)\b[^.]*)?/g, ''));

const render = (template, implement) => joinHold(
    template.split('{implement}').join(implement.noun || 'your bodyweight'),
    implement.hold,
)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();

const capitalise = (sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1);

const unique = (values) => [...new Set(values.filter(Boolean))];

/**
 * Everything this catalog row should carry beyond what it shipped with.
 *
 * Returns the finer muscles and a numbered instruction list. `matched` says
 * whether a real rule produced this or whether it fell through to the coarse
 * value -- the seeder reports the fall-throughs so the rules can be extended
 * rather than quietly shipping vague text.
 */
const classify = ({name, muscle, equipment}) => {
    const normalised = normalise(name);
    const rule = findRule(normalised);
    const implement = IMPLEMENTS[equipment] || DEFAULT_IMPLEMENT;
    const position = findPosition(normalised);
    const grip = findGrip(normalised);

    if (!rule) {
        const coarse = COARSE_FALLBACK[muscle] || {primary: M.FULL_BODY, secondary: []};
        const target = findBodyPart(normalised);

        return {
            matched: false,
            primaryMuscle: target || coarse.primary,
            secondaryMuscles: target ? [] : coarse.secondary,
            instructions: [
                render('Set yourself up for the movement with your core braced and {hold}.', implement),
                'Move through the full range under control, keeping your back in a neutral position.',
                'Return to the start slowly rather than letting the weight drop.',
                'Breathe out on the effort and in on the return.',
            ],
        };
    }

    // A stretch or a roll names its own target, and that beats the rule's
    // generic Full Body -- "Rolling Quadriceps" is a quad exercise.
    const target = (rule.isStretch && findBodyPart(normalised)) || null;

    const setup = typeof rule.setup === 'string'
        ? rule.setup
        : (rule.setup[position] || rule.setup.default);

    const instructions = [
        capitalise(render(setup, implement).split('{grip}').join(grip ? grip.label : 'an overhand grip')),
        ...rule.steps.map((step) => capitalise(render(step, implement))),
    ];

    if (grip) {
        instructions.push(`Use ${grip.label} and keep it consistent across every rep of the set.`);
    }

    CUES.forEach((cue) => {
        if (has(normalised, cue.p)) instructions.push(cue.text);
    });

    return {
        matched: true,
        primaryMuscle: target || rule.primary,
        secondaryMuscles: unique(
            target ? [] : [...rule.secondary, ...(grip ? grip.adds : [])],
        ).filter((entry) => entry !== (target || rule.primary)),
        instructions,
    };
};

module.exports = {
    MUSCLE_GROUPS,
    MUSCLES,
    RULES,
    classify,
    normalise,
};
