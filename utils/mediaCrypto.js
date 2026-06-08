const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const getEncryptionKey = () =>
  crypto
    .createHash("sha256")
    .update(process.env.MEDIA_URL_SECRET || process.env.JWT_SECRET || "")
    .digest();

/** Encrypt an S3 object key into an opaque URL-safe token. */
const encryptS3Key = (s3Key) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(s3Key, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
};

/** Decrypt a token back to the S3 object key. */
const decryptS3Key = (token) => {
  const data = Buffer.from(token, "base64url");
  if (data.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid media token");
  }

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
};

module.exports = { encryptS3Key, decryptS3Key };
