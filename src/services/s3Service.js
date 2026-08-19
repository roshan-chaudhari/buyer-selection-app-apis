const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3");

const BUCKET = process.env.AWS_S3_BUCKET || "buyer-selection-images-prod";
const REGION = process.env.AWS_REGION || "us-east-1";

// Clean folder/file names for safe S3 keys
const sanitize = (str) => String(str || "default").trim().replace(/[\\\/:*?"<>| ]+/g, "_");

function extractKeyFromUrl(keyOrUrl) {
  if (!keyOrUrl) return null;
  const str = String(keyOrUrl).trim();
  if (str.startsWith("http://") || str.startsWith("https://")) {
    try {
      const parsed = new URL(str);
      return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    } catch (e) {
      return str;
    }
  }
  return str;
}

/**
 * Uploads an image (Buffer or Base64) to AWS S3.
 * Folder structure: buyerapp-image/{projectName}/{styleName}/{fileName}
 */
async function uploadImageToS3({
  buffer,
  base64Data,
  mimeType = "image/jpeg",
  projectName = "General",
  styleName = "Style",
  fileName,
}) {
  let fileBuffer = buffer;

  // If base64 data is passed, convert to Buffer
  if (!fileBuffer && base64Data) {
    // If it's already an S3 URL or external URL, do not re-upload
    if (base64Data.startsWith("http://") || base64Data.startsWith("https://")) {
      const key = extractKeyFromUrl(base64Data);
      return { key, url: base64Data, fileName: fileName || "existing.jpg" };
    }
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    fileBuffer = Buffer.from(cleanBase64, "base64");
  }

  if (!fileBuffer) {
    throw new Error("No image buffer or base64Data provided for upload");
  }

  const safeProject = sanitize(projectName);
  const safeStyle = sanitize(styleName);
  const safeFileName = fileName ? sanitize(fileName) : `${safeStyle}_${Date.now()}.jpg`;

  // S3 Path: buyerapp-image/ProjectName/StyleName/fileName
  const key = `buyerapp-image/${safeProject}/${safeStyle}/${safeFileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    })
  );

  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

  return { key, url, fileName: safeFileName };
}

/**
 * Retrieves an image from AWS S3.
 */
async function getImageFromS3(keyOrUrl) {
  const key = extractKeyFromUrl(keyOrUrl);
  if (!key) {
    throw new Error("Invalid S3 key or URL");
  }

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  return {
    buffer,
    contentType: response.ContentType || "image/jpeg",
    base64: buffer.toString("base64"),
  };
}

/**
 * Deletes a single image from AWS S3.
 */
async function deleteImageFromS3(keyOrUrl) {
  const key = extractKeyFromUrl(keyOrUrl);
  if (!key) return false;

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
    return true;
  } catch (err) {
    console.error(`[S3] Error deleting image ${key}:`, err.message);
    return false;
  }
}

/**
 * Deletes all images belonging to a specific style under a project.
 * Prefix: buyerapp-image/{projectName}/{styleName}/
 */
async function deleteStyleFolderFromS3(projectName, styleName) {
  if (!projectName || !styleName) return false;

  const safeProject = sanitize(projectName);
  const safeStyle = sanitize(styleName);
  const prefix = `buyerapp-image/${safeProject}/${safeStyle}/`;

  try {
    const listRes = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
      })
    );

    if (listRes.Contents && listRes.Contents.length > 0) {
      const deleteParams = {
        Bucket: BUCKET,
        Delete: {
          Objects: listRes.Contents.map((obj) => ({ Key: obj.Key })),
        },
      };
      await s3Client.send(new DeleteObjectsCommand(deleteParams));
    } else {
    }
    return true;
  } catch (err) {
    console.error(`[S3] Error deleting style folder prefix ${prefix}:`, err.message);
    return false;
  }
}

module.exports = {
  uploadImageToS3,
  uploadBase64ToS3: uploadImageToS3,
  getImageFromS3,
  deleteImageFromS3,
  deleteStyleFolderFromS3,
  extractKeyFromUrl,
};

