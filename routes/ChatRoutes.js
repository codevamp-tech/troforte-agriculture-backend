import express from "express";
import { 
  getChatById, 
  getChatHistory, 
  handleChat, 
  deleteChat, 
  clearChatHistory 
} from "../controller/ChatController.js";

const router = express.Router();

// Chat streaming endpoint
router.post("/chat", handleChat);

// Get chat history for a device
router.get("/history", getChatHistory);        

// Get specific chat by ID
router.get("/chatById", getChatById);

// Delete a specific chat
router.delete("/chat", deleteChat);

// Clear all chat history for a device
router.delete("/history", clearChatHistory);

export default router;