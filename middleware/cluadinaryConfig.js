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
        const productName = req.body.productName
            ? req.body.productName.toLowerCase().replace(/\s+/g, '-')
            : 'unnamed';
        // Use fieldname and a random suffix for uniqueness
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const publicId = `${file.fieldname}-${productName}-${uniqueSuffix}`;
        return {
            folder: 'products',
            public_id: publicId,
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
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

module.exports = upload;