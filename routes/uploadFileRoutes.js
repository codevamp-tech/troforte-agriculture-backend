import express from "express";
import multer from "multer";
import path from "path";
import { uploadFile } from "../controller/uploadFileController.js";

const router = express.Router();

// Set storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Ensure this folder exists
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${file.fieldname}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

router.post("/upload", upload.single("file"), uploadFile);

export default router;
