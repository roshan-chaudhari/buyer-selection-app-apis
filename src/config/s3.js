const { S3Client } = require("@aws-sdk/client-s3");

const region = process.env.AWS_REGION || "us-east-1";
const bucket = process.env.AWS_S3_BUCKET || "buyer-selection-images-prod";
const hasAccessKey = Boolean(process.env.AWS_ACCESS_KEY_ID);
const hasSecretKey = Boolean(process.env.AWS_SECRET_ACCESS_KEY);

console.log("[AWS S3 Config] Initializing S3Client with configuration:", {
  region,
  bucket,
  hasAccessKey,
  accessKeyPreview: process.env.AWS_ACCESS_KEY_ID
    ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 4)}****`
    : "None (using AWS default provider chain / IAM)",
  hasSecretKey: hasSecretKey ? "Yes (set)" : "No",
});

const s3Config = {
  region,
};

if (hasAccessKey && hasSecretKey) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

const s3Client = new S3Client(s3Config);

module.exports = s3Client;
