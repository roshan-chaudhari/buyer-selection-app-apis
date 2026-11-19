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

function extractS3Urls(annotatedImage) {
  if (!annotatedImage) return [];
  const urls = [];
  const raw = String(annotatedImage).trim();
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((x) => {
          const u = typeof x === 'object' ? x?.annotated || x?.original : String(x || '');
          if (u && (String(u).includes('amazonaws.com') || String(u).includes('buyerapp-image') || (process.env.AWS_S3_BUCKET && String(u).includes(process.env.AWS_S3_BUCKET)))) {
            urls.push(String(u));
          }
        });
      }
    } catch (e) {}
  } else if (raw.includes('amazonaws.com') || raw.includes('buyerapp-image') || (process.env.AWS_S3_BUCKET && raw.includes(process.env.AWS_S3_BUCKET))) {
    urls.push(raw);
  }
  return urls;
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

function isPlmDefaultImage(keyOrUrl) {
  if (!keyOrUrl) return false;
  const str = String(keyOrUrl).toLowerCase();
  return str.includes('_default_') || str.includes('-default-');
}

/**
 * Deletes a single image from AWS S3.
 * The PLM default image can NEVER be deleted from S3; only annotations can be.
 */
async function deleteImageFromS3(keyOrUrl) {
  if (!keyOrUrl) return false;

  // Protect PLM default image from being deleted from S3
  if (isPlmDefaultImage(keyOrUrl)) {
    console.log(`[S3] Protected PLM default image from deletion: ${keyOrUrl}`);
    return false;
  }

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
 * Deletes all objects with a given S3 prefix, handling pagination if > 1000 items.
 */
async function deletePrefixFromS3(prefix) {
  if (!prefix) return false;
  try {
    let continuationToken = undefined;
    do {
      const listParams = {
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      };
      const listRes = await s3Client.send(new ListObjectsV2Command(listParams));

      if (listRes.Contents && listRes.Contents.length > 0) {
        const deleteParams = {
          Bucket: BUCKET,
          Delete: {
            Objects: listRes.Contents.map((obj) => ({ Key: obj.Key })),
          },
        };
        await s3Client.send(new DeleteObjectsCommand(deleteParams));
      }

      continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
    } while (continuationToken);

    return true;
  } catch (err) {
    console.error(`[S3] Error deleting prefix ${prefix}:`, err.message);
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

  return await deletePrefixFromS3(prefix);
}

/**
 * Deletes all images belonging to an entire project from AWS S3.
 * Prefix: buyerapp-image/{projectName}/
 */
async function deleteProjectFolderFromS3(projectName) {
  if (!projectName) return false;

  const safeProject = sanitize(projectName);
  const prefix = `buyerapp-image/${safeProject}/`;

  console.log(`[S3] Deleting all project images under prefix: ${prefix}`);
  return await deletePrefixFromS3(prefix);
}

module.exports = {
  uploadImageToS3,
  uploadBase64ToS3: uploadImageToS3,
  getImageFromS3,
  deleteImageFromS3,
  deleteStyleFolderFromS3,
  deleteProjectFolderFromS3,
  extractKeyFromUrl,
  extractS3Urls,
  isPlmDefaultImage,
};

