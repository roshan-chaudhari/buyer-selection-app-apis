const multer = require("multer");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
      "image/gif",
      "image/svg+xml",
    ];

    if (allowedTypes.includes(file.mimetype) || (file.mimetype && file.mimetype.startsWith("image/"))) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, WEBP, GIF, and SVG images are allowed"));
    }
  },
});

module.exports = { upload };
