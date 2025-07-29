import axios from "axios";
import { embedText } from "../utils/embed.js";
import { queryVectorStore } from "../utils/vector.js";
import { buildPrompt } from "../utils/prompt.js";

export default async function handleChat(req, res) {
  try {
    const { query } = req.body;

    console.log("req.body:", req.body);

    if (!query) return res.status(400).json({ error: "Query is required" });

    // 2. Search Upstash Vector for context
    const topChunks = await queryVectorStore(query);

    // 3. Format RAG prompt
    const promptMessages = buildPrompt(query, topChunks);
    console.log("prompt message", promptMessages);

    // 4. Call Together AI (DeepSeek R1)
    const llmResponse = await axios.post(
      "https://api.together.xyz/v1/chat/completions",
      {
        model: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",
        messages: promptMessages,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const answer =
      llmResponse.data.choices?.[0]?.message?.content || "No response.";
    console.log("anser", answer);
    res.json({ answer });
  } catch (err) {
    console.error("RAG error:", err);
    res.status(500).json({ error: "Something went wrong in RAG controller." });
  }
}
