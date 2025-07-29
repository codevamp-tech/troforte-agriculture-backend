import path from "path";
import { ragChat } from "../lib/rag-chat.js";

export const uploadFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const fileInfo = {
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    path: req.file.path,
  };

  console.log("📁 File uploaded:", fileInfo);

  await ragChat.context.add({
    type: "pdf",
    fileSource: fileInfo.path,
  });

  res
    .status(200)
    .json({ message: "File uploaded successfully", file: fileInfo });
};
