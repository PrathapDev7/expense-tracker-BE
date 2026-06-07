require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {createImageKey, uploadImageBuffer} = require('../config/s3');

const contentTypesByExtension = {
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

const imagePath = process.argv[2];

if (!imagePath) {
    console.error('Usage: npm run upload:test -- /absolute/path/to/image.png');
    process.exit(1);
}

const resolvedImagePath = path.resolve(imagePath);
const extension = path.extname(resolvedImagePath).toLowerCase();
const contentType = contentTypesByExtension[extension];

if (!contentType) {
    console.error('Unsupported image type. Try png, jpg, jpeg, gif, or webp.');
    process.exit(1);
}

if (!fs.existsSync(resolvedImagePath)) {
    console.error(`File not found: ${resolvedImagePath}`);
    process.exit(1);
}

const run = async () => {
    const key = createImageKey(path.basename(resolvedImagePath), 'test-images');
    const uploadedImage = await uploadImageBuffer({
        buffer: fs.readFileSync(resolvedImagePath),
        key,
        contentType,
    });

    console.log(JSON.stringify(uploadedImage, null, 2));
};

run().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
