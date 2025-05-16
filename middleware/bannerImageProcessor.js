const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;


const processBannerImage = async (req, res, next) => {

  if ((!req.files || Object.keys(req.files).length === 0) && !req.body.croppedImageData) {
    return next();
  }

  try {

    if (req.body.croppedImageData && req.body.croppedImageData.startsWith('data:image')) {

      return next();
    }

 
    if (req.files) {
      for (const fieldName in req.files) {
        for (const file of req.files[fieldName]) {
          console.log(`Processing banner image: ${file.filename}`);

          
          const processedPath = path.join(
            file.destination,
            `banner-${file.filename.split('.')[0]}.webp`
          );

     
          await sharp(file.path)
            .resize(1200, 400, {
              fit: "cover",
              position: "center",  
            })
            .webp({ quality: 85 })  
            .toFile(processedPath);

      
          file.path = processedPath;
          file.filename = `banner-${file.filename.split('.')[0]}.webp`;
          file.mimetype = 'image/webp';

          console.log(`Banner processed successfully: ${file.filename}`);
        }
      }
    }
    
    next();
  } catch (error) {
    console.error("Banner Image Processing Error:", error);
    next(error);
  }
};


const processBase64BannerImage = async (base64Data) => {
  try {
    if (!base64Data || !base64Data.startsWith('data:image')) {
      throw new Error('Invalid base64 image data');
    }


    const base64String = base64Data.split(';base64,').pop();
    const imageBuffer = Buffer.from(base64String, 'base64');
    
  
    const processedImageBuffer = await sharp(imageBuffer)
   
      .webp({ quality: 85 })
      .toBuffer();

    return `data:image/webp;base64,${processedImageBuffer.toString('base64')}`;
  } catch (error) {
    console.error("Base64 Banner Processing Error:", error);
    throw error;
  }
};

module.exports = {
  processBannerImage,
  processBase64BannerImage
};