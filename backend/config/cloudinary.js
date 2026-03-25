const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a base64 image to Cloudinary
 * Falls back gracefully if Cloudinary is not configured
 */
const uploadImage = async (base64Image) => {
  // If Cloudinary not configured, return the base64 as-is (fallback)
  if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud_name') {
    return base64Image;
  }
  const result = await cloudinary.uploader.upload(base64Image, {
    folder: 'lovechat',
    resource_type: 'image',
  });
  return result.secure_url;
};

module.exports = { uploadImage };
