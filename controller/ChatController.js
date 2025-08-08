import fetch from "node-fetch";
import { queryVectorStore } from "../utils/vector.js";
import { buildPrompt } from "../utils/prompt.js";
import { redis } from "../utils/redis.js";
import { recommendationPrompt } from "../utils/recommendationPrompt.js";

export async function handleChat(req, res) {
  try {
    const { query, deviceId, chatId: providedChatId } = req.body;
    const recommend = req.query.recommend === "true";

    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    // Helper to strip <think> tags
    const removeThinkTags = (text) => {
      let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
      cleaned = cleaned.replace(/<think[^>]*$/, "");
      cleaned = cleaned.replace(/^[^<]*<\/think>/, "");
      cleaned = cleaned.replace(/<\/think>/g, "");
      const openIndex = cleaned.lastIndexOf("<think>");
      if (openIndex !== -1) {
        cleaned = cleaned.substring(0, openIndex);
      }
      return cleaned.trim();
    };

    // ---------- RECOMMENDATION MODE ----------
    if (recommend) {
      const topChunks = await queryVectorStore(query);
      const promptMessages = recommendationPrompt(query, topChunks);

      const upstream = await fetch("https://api.together.xyz/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",
          messages: promptMessages,
          stream: false,
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!upstream.ok) {
        throw new Error(`AI API error: ${upstream.status}`);
      }

      const data = await upstream.json();
      const rawContent = data.choices?.[0]?.message?.content || "";
      const cleanedContent = removeThinkTags(rawContent);

      return res.json({ recommendation: cleanedContent });
    }

    // ---------- NORMAL CHAT MODE ----------
    if (!deviceId) {
      return res.status(400).json({ error: "Missing deviceId" });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(deviceId)) {
      return res.status(400).json({ error: "Invalid deviceId format" });
    }

    const chatId = providedChatId;
    let chat = await redis.get(`chat:${chatId}`);

    if (!chat) {
      chat = {
        chatId,
        deviceId,
        title: query.slice(0, 50) + (query.length > 50 ? "..." : ""),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [{ role: "user", content: query, timestamp: new Date().toISOString() }],
      };
      await redis.set(`chat:${chatId}`, JSON.stringify(chat));
      await redis.lpush(`device:${deviceId}:chats`, chatId);
      await redis.expire(`device:${deviceId}:chats`, 30 * 24 * 60 * 60);
    } else {
      if (chat.deviceId !== deviceId) {
        return res.status(403).json({ error: "Chat does not belong to this device" });
      }
      chat.messages.push({ role: "user", content: query, timestamp: new Date().toISOString() });
      chat.updatedAt = new Date().toISOString();
      await redis.set(`chat:${chatId}`, JSON.stringify(chat));
    }

    // Get vector context & build normal prompt
    const topChunks = await queryVectorStore(query);
    const promptMessages = buildPrompt(query, topChunks);

    const upstream = await fetch("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",
        messages: promptMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!upstream.ok) {
      throw new Error(`AI API error: ${upstream.status}`);
    }

    // Set streaming headers
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (res.flushHeaders) res.flushHeaders();

    let buffer = "";
    let assistantReply = "";
    let assistantReplyForSaving = "";

    try {
      for await (const chunk of upstream.body) {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;

          if (line.includes("[DONE]")) {
            assistantReplyForSaving = removeThinkTags(assistantReply);

            if (assistantReplyForSaving.trim()) {
              chat.messages.push({
                role: "assistant",
                content: assistantReplyForSaving,
                timestamp: new Date().toISOString(),
              });
            }

            chat.updatedAt = new Date().toISOString();
            await redis.set(`chat:${chatId}`, JSON.stringify(chat));

            res.write(JSON.stringify({ type: "complete" }) + "\n");
            res.end();
            return;
          }

          try {
            const json = JSON.parse(line.replace(/^data:\s*/, ""));
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) {
              assistantReply += delta;
              res.write(JSON.stringify({ type: "content", data: delta }) + "\n");
            }
          } catch (parseError) {
            console.warn("Failed to parse streaming chunk:", parseError.message);
          }
        }
      }
    } catch (streamError) {
      console.error("Streaming error:", streamError);

      if (assistantReply) {
        assistantReplyForSaving = removeThinkTags(assistantReply);
        if (assistantReplyForSaving.trim()) {
          chat.messages.push({
            role: "assistant",
            content: assistantReplyForSaving + "\n\n[Response incomplete due to connection error]",
            timestamp: new Date().toISOString(),
          });
          chat.updatedAt = new Date().toISOString();
          await redis.set(`chat:${chatId}`, JSON.stringify(chat));
        }
      }

      res.write(JSON.stringify({ type: "error", message: "Connection error" }) + "\n");
    }

    res.end();
  } catch (err) {
    console.error("Chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Server error occurred" });
    } else {
      res.write(JSON.stringify({ type: "error", message: "Server error occurred" }) + "\n");
      res.end();
    }
  }
}

/** Get all chat metadata for a device with pagination */
export async function getChatHistory(req, res) {
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


    // Get paginated chat IDs (most recent first)
    const chatIds = await redis.lrange(`device:${deviceId}:chats`, 0, -1);

    if (chatIds.length === 0) {
      return res.json({
        chats: [],
      });
    }

    // Get chat metadata
    const chats = await Promise.all(
      chatIds.map(async (id) => {
        try {
          const chat = await redis.get(`chat:${id}`);
          if (!chat || chat.deviceId !== deviceId) return null;
          
          return {
            chatId: chat.chatId,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            messageCount: chat.messages?.length || 0,
            lastMessage: chat.messages?.[chat.messages.length - 1]?.content?.slice(0, 100) || ""
          };
        } catch (error) {
          console.error(`Error fetching chat ${id}:`, error);
          return null;
        }
      })
    );

    const validChats = chats.filter(Boolean);

    res.json({
      chats: validChats,
    });
  } catch (err) {
    console.error("Get chat history error:", err);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
}

/** Get full chat by chatId with device verification */
export async function getChatById(req, res) {
  try {
    const { chatId, deviceId } = req.query;
    
    if (!chatId || !deviceId) {
      return res.status(400).json({ error: "Missing chatId or deviceId" });
    }

    // Validate deviceId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(deviceId) || !uuidRegex.test(chatId)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const chat = await redis.get(`chat:${chatId}`);
    
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Verify chat belongs to this device
    if (chat.deviceId !== deviceId) {
      return res.status(403).json({ error: "Chat does not belong to this device" });
    }

    res.json(chat);
  } catch (err) {
    console.error("Get chat by ID error:", err);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
}

/** Delete a chat (soft delete - just remove from device list) */
export async function deleteChat(req, res) {
  try {
    const { chatId, deviceId } = req.body;
    
    if (!chatId || !deviceId) {
      return res.status(400).json({ error: "Missing chatId or deviceId" });
    }

    const chat = await redis.get(`chat:${chatId}`);
    
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Verify ownership
    if (chat.deviceId !== deviceId) {
      return res.status(403).json({ error: "Chat does not belong to this device" });
    }

    // Remove from device's chat list
    await redis.lrem(`device:${deviceId}:chats`, 0, chatId);
    
    // Optionally delete the chat data entirely
    await redis.del(`chat:${chatId}`);

    res.json({ success: true, message: "Chat deleted successfully" });
  } catch (err) {
    console.error("Delete chat error:", err);
    res.status(500).json({ error: "Failed to delete chat" });
  }
}

/** Clear all chats for a device */
export async function clearChatHistory(req, res) {
  try {
    const { deviceId } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ error: "Missing deviceId" });
    }

    // Get all chat IDs for this device
    const chatIds = await redis.lrange(`device:${deviceId}:chats`, 0, -1);
    
    if (chatIds.length > 0) {
      // Delete all chat data
      const deletePromises = chatIds.map(chatId => redis.del(`chat:${chatId}`));
      await Promise.all(deletePromises);
    }

    // Clear the device's chat list
    await redis.del(`device:${deviceId}:chats`);

    res.json({ 
      success: true, 
      message: `Cleared ${chatIds.length} chats`,
      deletedCount: chatIds.length 
    });
  } catch (err) {
    console.error("Clear chat history error:", err);
    res.status(500).json({ error: "Failed to clear chat history" });
  }
}