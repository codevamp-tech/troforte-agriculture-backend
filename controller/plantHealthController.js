import axios from "axios";
import dotenv from "dotenv";
import { redis } from "../utils/redis.js";
import { cleanupFiles, convertImageToBase64 } from "../utils/helper.js";
import { uploadFileToS3 } from "../utils/s3Upload.js";

dotenv.config();

// Plant.id API configuration
const PLANT_ID_API_KEY = "aiWL2utUws3mxpRaxZRUyAs7xhCLtLvgD6p4z1NG4iSnX7Vteu";
const PLANT_ID_BASE_URL = "https://api.plant.id/v3";

//get analysis history
export async function getAnalysisHistory(req, res) {
  try {
    const { deviceId } = req.query;
    
    if (!deviceId) {
      return res.status(400).json({ error: "Missing deviceId" });
    }

    // Validate deviceId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(deviceId)) {
      return res.status(400).json({ error: "Invalid deviceId format" });
    }

    const analysisId = await redis.lrange(`device:${deviceId}:analysis`, 0, -1);

    if (analysisId.length === 0) {
      return res.json({
        analysis: [],
      });
    }

    // Get chat metadata
    const analysis = await Promise.all(
      analysisId.map(async (id) => {
        try {
          const analysis = await redis.get(`analysis:${id}`);
          if (!analysis || analysis.deviceId !== deviceId) return null;
          
          return {
            imageUrl: analysis.imageUrl,
            analysisId: analysis.analysisId,
            createdAt: analysis.createdAt,
            updatedAt: analysis.updatedAt,
            analysis: analysis.analysis
          };
        } catch (error) {
          console.error(`Error fetching analysis ${id}:`, error);
          return null;
        }
      })
    );

    const validAnalysis = analysis.filter(Boolean);

    res.json({
      analysis: validAnalysis,
    });
  } catch (err) {
    console.error("Get analysis history error:", err);
    res.status(500).json({ error: "Failed to fetch analysis history" });
  }
}

// get analysis by id 
export async function getAnalysisById(req, res) {
  try {
    const { analysisId, deviceId } = req.query;
    
    if (!analysisId || !deviceId) {
      return res.status(400).json({ error: "Missing analysisId or deviceId" });
    }

    // Validate deviceId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(deviceId) || !uuidRegex.test(analysisId)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const analysis = await redis.get(`analysis:${analysisId}`);
    
    if (!analysis) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    // Verify analysis belongs to this device
    if (analysis.deviceId !== deviceId) {
      return res.status(403).json({ error: "Chat does not belong to this device" });
    }

    res.json(analysis);
  } catch (err) {
    console.error("Get analysis by ID error:", err);
    res.status(500).json({ error: "Failed to fetch analysis" });
  }
}

// Analyze plant health
export const analyzePlantHealth = async (req, res) => {
  try {
    // Validate API key
    if (!PLANT_ID_API_KEY || PLANT_ID_API_KEY === "YOUR_API_KEY_HERE") {
      return res.status(500).json({
        success: false,
        error: "API key not configured",
        message: "Plant.id API key is missing or invalid",
      });
    }

    // Validate images
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No images provided",
        message: "Please upload at least one image",
      });
    }
    const imageUrl = await uploadFileToS3(req.file); 

    console.log(
      `Processing image for plant health analysis...`
    );

    // Convert images to base64
    let base64Images;
    try {
      base64Images = convertImageToBase64(req.file);
    } catch (error) {
      // cleanupFiles(req.files);
      return res.status(400).json({
        success: false,
        error: "Image processing failed",
        message: error.message,
      });
    }

    // save to redis
    const { analysisId, deviceId } = req.body;

    if (!analysisId || !deviceId) {
      return res.status(400).json({ error: "Missing analysis or deviceId" });
    }

    let analysis = await redis.get(`analysis:${analysisId}`);

    // Prepare data for Plant.id API
    const plantIdData = {
      images: base64Images,
      similar_images: true, // Direct boolean as in example
    };

    // Add location data if provided
    if (req.body.latitude && req.body.longitude) {
      plantIdData.latitude = parseFloat(req.body.latitude);
      plantIdData.longitude = parseFloat(req.body.longitude);
    }

    console.log("Sending request to Plant.id API for health assessment...");

    // Make request to Plant.id API
    const response = await axios.post(
      `${PLANT_ID_BASE_URL}/health_assessment?language=en&details=local_name%2Cdescription%2Curl%2Ctreatment%2Cclassification%2Ccommon_names%2Ccause`,
      plantIdData,
      {
        headers: {
          "Content-Type": "application/json",
          "Api-Key": PLANT_ID_API_KEY,
        },
        timeout: 30000,
      }
    );

    // Clean up uploaded files
    // cleanupFiles(req.files);
    // Process and send response
    const result = response.data;

    if (!analysis) {
      analysis = {
        imageUrl,
        analysisId,
        deviceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        analysis: result,
      };
      await redis.set(`analysis:${analysisId}`, analysis);
      await redis.lpush(`device:${deviceId}:analysis`, analysisId);
    }

    // Add metadata
    const processedResult = {
      ...result,
      metadata: {
        processed_at: new Date().toISOString(),
        image_count: base64Images.length,
        location_provided: !!(req.body.latitude && req.body.longitude),
        api_version: "plant_id:4.3.1",
      },
    };

    console.log("Plant health analysis completed successfully");

    res.json({
      success: true,
      message: "Plant health analysis completed",
      data: processedResult,
    });
  } catch (error) {
    console.error("Plant health analysis error:", error.message);

    // cleanupFiles(req.files);

    if (error.response) {
      const statusCode = error.response.status;
      const errorData = error.response.data;

      return res.status(statusCode).json({
        success: false,
        error: "Plant.id API error",
        message: errorData?.message || error.message,
        details: errorData,
        api_error_code: statusCode,
      });
    } else if (error.code === "ECONNABORTED") {
      // Timeout error
      return res.status(408).json({
        success: false,
        error: "Request timeout",
        message:
          "The plant analysis request timed out. Please try again with smaller images or fewer images.",
      });
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      // Network error
      return res.status(503).json({
        success: false,
        error: "Network error",
        message:
          "Unable to connect to Plant.id service. Please check your internet connection.",
      });
    } else {
      // Other errors
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message:
          error.message ||
          "An unexpected error occurred during plant health analysis",
      });
    }
  }
};

// Identify plant species
export const identifyPlant = async (req, res) => {
  try {
    // Validate API key
    if (!PLANT_ID_API_KEY || PLANT_ID_API_KEY === "YOUR_API_KEY_HERE") {
      return res.status(500).json({
        success: false,
        error: "API key not configured",
        message: "Plant.id API key is missing or invalid",
      });
    }

    // Validate images
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No images provided",
        message: "Please upload at least one image",
      });
    }

    console.log(
      `Processing ${req.files.length} images for plant identification...`
    );

    // Convert images to base64
    let base64Images;
    try {
      base64Images = convertImageToBase64(req.files);
    } catch (error) {
      cleanupFiles(req.files);
      return res.status(400).json({
        success: false,
        error: "Image processing failed",
        message: error.message,
      });
    }

    // Prepare data for Plant.id API
    const plantIdData = {
      api_key: PLANT_ID_API_KEY,
      images: base64Images,
      modifiers: ["crops_fast", "similar_images"],
      language: req.body.language || "en",
    };

    // Add location data if provided
    if (req.body.latitude && req.body.longitude) {
      plantIdData.latitude = parseFloat(req.body.latitude);
      plantIdData.longitude = parseFloat(req.body.longitude);
    }

    console.log("Sending request to Plant.id API for identification...");

    // Make request to Plant.id API
    const response = await axios.post(
      `${PLANT_ID_BASE_URL}/identify`,
      plantIdData,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    // Clean up uploaded files
    cleanupFiles(req.files);

    // Add metadata
    const result = {
      ...response.data,
      metadata: {
        processed_at: new Date().toISOString(),
        image_count: base64Images.length,
        location_provided: !!(req.body.latitude && req.body.longitude),
        api_version: "plant_id:4.3.1",
      },
    };

    console.log("Plant identification completed successfully");

    res.json({
      success: true,
      message: "Plant identification completed",
      data: result,
    });
  } catch (error) {
    console.error("Plant identification error:", error.message);

    // Clean up uploaded files in case of error
    cleanupFiles(req.files);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: "Plant.id API error",
        message: error.response.data?.message || error.message,
        details: error.response.data,
      });
    } else if (error.code === "ECONNABORTED") {
      return res.status(408).json({
        success: false,
        error: "Request timeout",
        message:
          "The plant identification request timed out. Please try again.",
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message:
          error.message ||
          "An unexpected error occurred during plant identification",
      });
    }
  }
};
