const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create absolute path for uploads directory
const uploadDir = path.join(__dirname, '..', 'uploads');

// Create directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Set up multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}${ext}`);
    }
});

// Allow images, PDFs, and PPT/PPTX files
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/jpg',
        'application/pdf',
        'application/vnd.ms-powerpoint',              // .ppt
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' // .pptx
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image, PDF, or PPT files are allowed!'), false);
    }
};

// Create multer upload instance
const upload = multer({ storage, fileFilter });

module.exports = upload;

