/**
 * Compresses the fetched animation catalog into the file that ships in git.
 *
 * The raw catalog is 92 MB and cannot be committed. Gzipped as one stream it is
 * about 12 MB — small enough to live in the repo, which is what lets a deployed
 * host seed itself with no external dependency and no manual step. One stream
 * rather than per-entry compression on purpose: sharing a single dictionary
 * across all 1603 compositions is worth roughly a megabyte over compressing
 * them individually, and the seeder gunzips it as a stream either way.
 *
 * Re-run this after "npm run fetchAnimations" and commit the result.
 *
 * Usage: npm run packAnimations
 */
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const util = require('util');
const zlib = require('zlib');

const pipeline = util.promisify(stream.pipeline);

const RAW_FILE = path.join(__dirname, 'data', 'exercise_animations.json');
const PACKED_FILE = `${RAW_FILE}.gz`;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function runPack() {
    try {
        if (!fs.existsSync(RAW_FILE)) {
            console.error(`No catalog at ${path.relative(process.cwd(), RAW_FILE)}`);
            console.error('Run "npm run fetchAnimations" first.');
            process.exit(1);
        }

        const rawSize = fs.statSync(RAW_FILE).size;
        console.log(`Packing ${mb(rawSize)} from ${path.relative(process.cwd(), RAW_FILE)}`);

        // Written to a temporary name and renamed at the end, so an interrupted
        // run cannot leave a truncated archive sitting where the seeder — and a
        // deploy — would trust it.
        const partial = `${PACKED_FILE}.partial`;
        await pipeline(
            fs.createReadStream(RAW_FILE),
            zlib.createGzip({level: zlib.constants.Z_BEST_COMPRESSION}),
            fs.createWriteStream(partial),
        );
        fs.renameSync(partial, PACKED_FILE);

        const packedSize = fs.statSync(PACKED_FILE).size;
        console.log(`Wrote ${path.relative(process.cwd(), PACKED_FILE)} — ${mb(packedSize)} (${(rawSize / packedSize).toFixed(1)}x smaller)`);
        console.log('Commit this file so a deployed host can seed itself.');
    } catch (err) {
        console.error('Error packing the catalog:', err);
        process.exit(1);
    }
}

runPack();
