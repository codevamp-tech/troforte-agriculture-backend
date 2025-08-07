import fs from "fs";

// Helper function to convert images to base64
export const convertImagesToBase64 = (files) => {
  return files.map((file) => {
    try {
      const imageData = fs.readFileSync(file.path);
      const base64 = Buffer.from(imageData).toString("base64");
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      console.error(`Error reading file ${file.path}:`, error);
      throw new Error(`Failed to process image: ${file.originalname}`);
    }
  });
};

// Helper function to clean up uploaded files
export const cleanupFiles = (files) => {
  if (!files) return;

  files.forEach((file) => {
    fs.unlink(file.path, (err) => {
      if (err) {
        console.error("Error deleting file:", file.path, err);
      } else {
        console.log("Successfully deleted file:", file.path);
      }
    });
  });
};