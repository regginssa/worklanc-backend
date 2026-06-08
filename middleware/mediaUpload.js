const multer = require("multer");
const path = require("path");

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "text/plain",
]);

const MIME_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "text/plain": ".txt",
};

const ALLOWED_PURPOSES = new Set(["avatar", "portfolio", "asset"]);

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      new Error(
        "Unsupported file type. Allowed: images, PDF, video, audio, or text.",
      ),
    );
  }
  cb(null, true);
};

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

const resolveExtension = (file) => {
  const fromMime = MIME_EXTENSIONS[file.mimetype];
  if (fromMime) return fromMime;

  const ext = path.extname(file.originalname).toLowerCase();
  return ext || "";
};

const resolvePurpose = (value) => {
  const purpose = String(value || "asset").toLowerCase();
  return ALLOWED_PURPOSES.has(purpose) ? purpose : "asset";
};

module.exports = {
  mediaUpload,
  MAX_FILE_SIZE,
  resolveExtension,
  resolvePurpose,
  ALLOWED_PURPOSES,
};
