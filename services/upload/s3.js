const {
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const s3Client = require("../../config/s3Client");

const getBucket = () => {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not configured");
  return bucket;
};

const uploadBufferToS3 = async ({ key, buffer, contentType }) => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return key;
};

const getObjectFromS3 = async (key) => {
  const result = await s3Client.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
  );
  return result;
};

/** @deprecated Prefer uploadBufferToS3 + encrypted URLs instead of public links. */
const uploadToS3 = async (params) => {
  try {
    await s3Client.send(new PutObjectCommand(params));
    const fileUrl = `https://${getBucket()}.s3.${process.env.AWS_REGION}.amazonaws.com/${params.Key}`;
    return fileUrl;
  } catch (error) {
    console.error("[upload to s3 error]: ", error);
    return null;
  }
};

module.exports = { uploadToS3, uploadBufferToS3, getObjectFromS3 };
