require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const productName = req.body.title
            ? req.body.title.toLowerCase().replace(/\s+/g, '-')
            : 'unnamed';
        return {
            folder: 'banners',
            public_id: `${productName}-${Date.now()}`,
            format: 'webp',
            transformation: [
                { width: 800, height: 800, crop: 'fill' },
                { quality: 80 }
            ]
        };
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

module.exports = upload;