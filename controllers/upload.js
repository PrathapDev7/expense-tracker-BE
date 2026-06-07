const multer = require('multer');
const {createImageKey, uploadImageBuffer} = require('../config/s3');

const storage = multer.memoryStorage();

const imageFileFilter = (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image uploads are allowed.'));
    }

    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024,
    },
}).single('image');

const uploadImageMiddleware = (req, res, next) => {
    upload(req, res, (error) => {
        if (!error) {
            return next();
        }

        const message = error instanceof multer.MulterError
            ? 'Image upload must be 2MB or smaller.'
            : error.message;

        return res.status(400).json({status: 400, message});
    });
};

const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({status: 400, message: 'Image file is required.'});
        }

        const key = createImageKey(req.file.originalname);
        const uploadedImage = await uploadImageBuffer({
            buffer: req.file.buffer,
            key,
            contentType: req.file.mimetype,
        });

        res.status(201).json({
            status: 201,
            data: uploadedImage,
        });
    } catch (error) {
        res.status(500).json({status: 500, message: error.message || 'Image upload failed.'});
    }
};

module.exports = {
    uploadImage,
    uploadImageMiddleware,
};
