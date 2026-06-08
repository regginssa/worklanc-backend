const crypto = require("crypto");
const {
  uploadBufferToS3,
  getObjectFromS3,
  deleteObjectFromS3,
} = require("../services/upload/s3");
const { encryptS3Key, decryptS3Key } = require("../utils/mediaCrypto");
const { resolveExtension, resolvePurpose } = require("../middleware/mediaUpload");

const buildAssetPath = (encryptedUrl) =>
  `/api/upload/asset/${encryptedUrl}`;

// POST /upload — receive file, store in private S3, return encrypted reference.
const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const purpose = resolvePurpose(req.body.purpose);
    const ext = resolveExtension(req.file);
    const objectKey = `${purpose}/${req.user.id}/${crypto.randomUUID()}${ext}`;

    await uploadBufferToS3({
      key: objectKey,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
    });

    const encryptedUrl = encryptS3Key(objectKey);

    return res.status(201).json({
      encryptedUrl,
      url: buildAssetPath(encryptedUrl),
      mimeType: req.file.mimetype,
      fileName: req.file.originalname,
      size: req.file.size,
      purpose,
    });
  } catch (error) {
    console.error("uploadMedia error: ", error);
    return res.status(500).json({ message: "Upload failed" });
  }
};

// GET /upload/asset/:token — decrypt token and stream the object from S3.
const serveMedia = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ message: "Missing asset token" });
    }

    const objectKey = decryptS3Key(token);
    const object = await getObjectFromS3(objectKey);

    if (object.ContentType) {
      res.setHeader("Content-Type", object.ContentType);
    }
    if (object.ContentLength != null) {
      res.setHeader("Content-Length", String(object.ContentLength));
    }
    res.setHeader("Cache-Control", "private, max-age=3600");

    const stream = object.Body;
    if (!stream || typeof stream.pipe !== "function") {
      return res.status(500).json({ message: "Unable to read asset" });
    }

    stream.on("error", (err) => {
      console.error("serveMedia stream error: ", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Unable to stream asset" });
      }
    });

    return stream.pipe(res);
  } catch (error) {
    console.error("serveMedia error: ", error);
    if (error.message === "Invalid media token") {
      return res.status(400).json({ message: "Invalid asset token" });
    }
    return res.status(404).json({ message: "Asset not found" });
  }
};

const ALLOWED_PURPOSES = new Set(["avatar", "portfolio", "asset"]);

const assertUserOwnsObjectKey = (objectKey, userId) => {
  const [purpose, ownerId] = objectKey.split("/");
  if (!ALLOWED_PURPOSES.has(purpose)) {
    throw new Error("Invalid asset purpose");
  }
  if (String(ownerId) !== String(userId)) {
    throw new Error("Forbidden");
  }
};

// DELETE /upload/:token — remove a previously uploaded object owned by the user.
const deleteMedia = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ message: "Missing asset token" });
    }

    const objectKey = decryptS3Key(token);
    assertUserOwnsObjectKey(objectKey, req.user.id);
    await deleteObjectFromS3(objectKey);

    return res.status(200).json({ deleted: true });
  } catch (error) {
    console.error("deleteMedia error: ", error);
    if (error.message === "Invalid media token") {
      return res.status(400).json({ message: "Invalid asset token" });
    }
    if (error.message === "Forbidden") {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (error.message === "Invalid asset purpose") {
      return res.status(400).json({ message: "Invalid asset" });
    }
    return res.status(500).json({ message: "Delete failed" });
  }
};

module.exports = { uploadMedia, serveMedia, deleteMedia, buildAssetPath };
