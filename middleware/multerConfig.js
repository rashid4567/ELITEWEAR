const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join('public', 'uploads', 'product-images');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const productName = req.body.productName
            ? req.body.productName.toLowerCase().replace(/\s+/g, '-')
            : 'unnamed';
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${productName}-${timestamp}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1024 * 1024 * 5, 
        files: 4
    }
});

module.exports = upload;