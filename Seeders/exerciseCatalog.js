const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'exercises');
const CSV_FILE = path.join(DIR, 'exercises.csv');
const ASSETS_DIR = path.join(DIR, 'assets');
const GIF_URL_PREFIX = '/exercise-gifs';

/**
 * Minimal RFC-4180 reader: handles quoted fields containing commas, embedded
 * quotes ("") and newlines. The catalog's instructions are full sentences, so
 * splitting rows on '\n' naively would shred them.
 */
const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];

        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\r') {
            // Ignored; the '\n' that follows ends the row.
        } else if (char === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }

    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter((entry) => entry.length > 1 || String(entry[0] || '').trim() !== '');
};

const clean = (value) => String(value == null ? '' : value).replace(/\uFEFF/g, '').trim();

// The header flattens arrays into numbered columns -- instructions/0..10,
// secondaryMuscles/0..5 -- in whatever order the exporter wrote them, so they
// are regrouped by prefix rather than read positionally.
const collectPrefixed = (record, prefix) => Object.keys(record)
    .filter((key) => key.startsWith(`${prefix}/`))
    .sort((a, b) => Number(a.slice(prefix.length + 1)) - Number(b.slice(prefix.length + 1)))
    .map((key) => clean(record[key]))
    .filter(Boolean);

/**
 * Reads the catalog CSV into plain records, each carrying the gif for its id.
 * The match is by id, not by name: 6 names occur twice in the catalog, and
 * names carry parentheticals and punctuation that filenames would have to
 * guess at, while `${id}.gif` is exact. A missing asset leaves gif null and
 * is counted so the seeder can report it rather than fail the whole seed.
 */
const readCatalog = () => {
    const rows = parseCsv(fs.readFileSync(CSV_FILE, 'utf8'));
    const header = rows[0].map((cell) => clean(cell).replace(/^\uFEFF/, ''));

    const available = new Set(
        fs.readdirSync(ASSETS_DIR)
            .filter((file) => file.toLowerCase().endsWith('.gif'))
            .map((file) => path.basename(file, path.extname(file))),
    );

    const records = [];
    let withoutGif = 0;

    for (const cells of rows.slice(1)) {
        const record = {};
        header.forEach((key, index) => {
            record[key] = cells[index] == null ? '' : cells[index];
        });

        const id = clean(record.id);
        if (!id) continue;

        const name = clean(record.name);
        const target = clean(record.target);
        if (!name || !target) continue;

        const hasGif = available.has(id);
        if (!hasGif) withoutGif += 1;

        records.push({
            _id: id,
            name,
            bodyPart: clean(record.bodyPart),
            equipment: clean(record.equipment),
            target,
            secondaryMuscles: collectPrefixed(record, 'secondaryMuscles'),
            instructions: collectPrefixed(record, 'instructions'),
            gif: hasGif ? `${GIF_URL_PREFIX}/${id}.gif` : null,
            hasGif,
        });
    }

    return {records, withoutGif, assets: available.size};
};

module.exports = {DIR, CSV_FILE, ASSETS_DIR, GIF_URL_PREFIX, parseCsv, readCatalog};
