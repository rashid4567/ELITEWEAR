const sharp = require("sharp");
const path = require("path");

const processImages = async (req, res, next) => {
  if (!req.files) return next();

  try {
    for (const fieldName in req.files) {
      for (const file of req.files[fieldName]) {
        const processedPath = path.join(
          file.destination,
          `processed-${file.filename}`
        );

        await sharp(file.path)
          .resize(800, 800, {
            fit: "cover",
            withoutEnlargement: true,
          })
          .webp({ quality: 80 })
          .toFile(processedPath);

        file.path = processedPath;
        file.filename = `processed-${file.filename}`;
      }
    }
    next();
  } catch (error) {
    console.error("Image Processing Error:", error);
    next(error);
  }
};

module.exports = processImages;
