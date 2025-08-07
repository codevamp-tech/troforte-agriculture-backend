import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { 
  analyzePlantHealth, 
  getAnalysisById, 
  getAnalysisHistory, 
  identifyPlant,
} from '../controller/plantHealthController.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '../uploads/plants';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `plant_${uniqueSuffix}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// get analysis history
router.get('/analysis-history', getAnalysisHistory)

// get analysis by Id
router.get('/analysisById', getAnalysisById)

// Plant health assessment endpoint
router.post('/plant-health/analyze', upload.array('images', 5), analyzePlantHealth);

// Plant identification endpoint
router.post('/plant-health/identify', upload.array('images', 5), identifyPlant);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'Image size should be less than 10MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        message: 'Maximum 5 images allowed'
      });
    }
  }
  
  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type',
      message: 'Only image files are allowed'
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Server error',
    message: error.message
  });
});

export default router;