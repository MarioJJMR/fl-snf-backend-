const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.BUCKET_REGION || 'us-east-1',
  endpoint: process.env.BUCKET_ENDPOINT,
  credentials: {
    accessKeyId: process.env.BUCKET_ACCESS_KEY_ID,
    secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.BUCKET_NAME;

module.exports = { s3, BUCKET_NAME };
