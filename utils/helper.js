import fs from "fs";

// Helper function to convert images to base64
export const convertImageToBase64 = (file) => {
  try {
    const base64 = file.buffer.toString("base64");
    const mimeType = file.mimetype || "image/jpeg"; // fallback just in case
    return [`data:${mimeType};base64,${base64}`]; // return as array for compatibility
  } catch (error) {
    console.error("Error converting image to base64:", error);
    throw new Error(`Failed to convert image to base64`);
  }
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