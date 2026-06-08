const path = require('path');
const crypto = require('crypto');
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3');

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const bucket = process.env.AWS_S3_BUCKET;

const credentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
    : undefined;

const s3Client = new S3Client({
    region,
    credentials,
});

const assertS3Config = () => {
    if (!bucket || !region) {
        throw new Error('Missing AWS_S3_BUCKET or AWS_REGION in environment config.');
    }
};

const encodeS3Key = (key) => key.split('/').map(encodeURIComponent).join('/');

const getPublicAssetUrl = (key) => {
    const baseUrl = process.env.AWS_PUBLIC_ASSET_URL;

    if (baseUrl) {
        return `${baseUrl.replace(/\/$/, '')}/${encodeS3Key(key)}`;
    }

    return `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;
};

const createImageKey = (originalName, folder = 'images') => {
    const fallbackName = 'image';
    const safeName = path.basename(originalName || fallbackName)
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .toLowerCase();
    const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

    return `${folder}/${uniqueId}-${safeName || fallbackName}`;
};

const uploadImageBuffer = async ({buffer, key, contentType}) => {
    assertS3Config();

    await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
    }));

    return {
        bucket,
        key,
        url: getPublicAssetUrl(key),
    };
};

module.exports = {
    createImageKey,
    uploadImageBuffer,
};
