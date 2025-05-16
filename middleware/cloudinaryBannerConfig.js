require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {

    const uniqueId = Date.now();
    return {
      folder: "banners", 
      public_id: `banner-${uniqueId}`,
      format: "webp",
      transformation: [

        { quality: 85 },
      ],
      overwrite: true,
    }
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});


const uploadBase64Image = async (base64Data, publicId = null) => {
  try {
    if (!base64Data || typeof base64Data !== "string") {
      throw new Error("Invalid image data provided");
    }


    console.log("Base64 data prefix:", base64Data.substring(0, 50));
    console.log("Base64 data length:", base64Data.length);

    
    let formattedBase64 = base64Data;
    if (!base64Data.startsWith("data:image")) {
      console.log("Reformatting base64 data...");
      formattedBase64 = `data:image/jpeg;base64,${base64Data.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "")}`;
    }

    const options = {
      folder: "banners",
      format: "webp",
      quality: 85,
      resource_type: "image",
    };

  
    if (publicId) {
      options.public_id = publicId;
      options.overwrite = true;
    } else {

      options.public_id = `banner-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    console.log("Cloudinary upload options:", JSON.stringify(options));
    console.log("Attempting to upload image to Cloudinary...");


    const result = await Promise.race([
      cloudinary.uploader.upload(formattedBase64, options),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Upload timed out after 45s")), 45000)
      )
    ]);

    console.log("Image uploaded successfully to Cloudinary:", result.public_id);
    return result;
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
 
    if (error.http_code) {
      console.error(`HTTP Error: ${error.http_code}`);
    }
    if (error.message) {
      console.error(`Error message: ${error.message}`);
    }
    throw new Error(`Cloudinary upload failed: ${error.message || "Unknown error"}`);
  }
};


const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    throw error;
  }
};


const getPublicIdFromUrl = (url) => {
  if (!url) return null;


  const regex = /\/v\d+\/(.+)\.\w+$/;
  const match = url.match(regex);

  if (match && match[1]) {
    return match[1];
  }

  return null;
};

module.exports = {
  upload,
  uploadBase64Image,
  deleteImage,
  getPublicIdFromUrl,
  cloudinary,
};