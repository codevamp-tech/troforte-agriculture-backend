import { RAGChat, upstash } from "@upstash/rag-chat";
import { redis } from "./redis.js";
import "dotenv/config";
export const ragChat = new RAGChat({
  model: upstash("mistralai/Mistral-7B-Instruct-v0.2", {
    maxTokens: 512,
    temperature: 0.7,
    topP: 0.9,
  }),
  redis: redis,
  promptFn: ({ question, context }) => {
    // Trim question to limit input size if needed
    const trimmedQuestion = question.split(" ").slice(0, 50).join(" ");
    const keyTerms = extractKeyTerms(trimmedQuestion);
    // Prioritize lead-related documents
    let leadsRelated = keyTerms.some((term) =>
      [
        "leads",
        "customer",
        "sales lead",
        "CRM",
        "contact",
        "opportunity",
      ].includes(term.toLowerCase())
    );
    let processedContext = "";
    if (leadsRelated) {
      // Prioritize the CSV context for leads-related queries
      processedContext = context
        .split(/\n{2,}/)
        .filter((para) => para.includes("leads") || para.includes("customer"))
        .join("\n\n");
      // If no leads-related content is found in context, return a fallback response
      if (!processedContext) {
        return `The provided documents do not contain sufficient data about leads or customers. Please upload a relevant file.`;
      }
    } else if (typeof context === "string" && context.length > 0) {
      // Extract key terms from the question for context processing
      const keyTerms = extractKeyTerms(trimmedQuestion);
      // Split context into paragraphs for more granular processing
      const paragraphs = context.split(/\n{2,}/);
      // Score paragraphs based on relevance to question
      const scoredParagraphs = paragraphs.map((para) => {
        let score = 0;
        keyTerms.forEach((term) => {
          // Count occurrences of key terms
          const regex = new RegExp(term, "gi");
          const matches = (para.match(regex) || []).length;
          score += matches;
        });
        return { text: para, score };
      });
      // Sort paragraphs by relevance score (highest first)
      const sortedParagraphs = [...scoredParagraphs].sort(
        (a, b) => b.score - a.score
      );
      // Combine the most relevant paragraphs into processed context
      // Include all paragraphs with non-zero scores first
      const relevantParagraphs = sortedParagraphs.filter((p) => p.score > 0);
      // If we don't have enough relevant paragraphs, include some from the original context
      // to maintain document flow and provide background information
      const MAX_PARAGRAPHS = 15;
      if (relevantParagraphs.length < MAX_PARAGRAPHS) {
        // Add some original paragraphs while maintaining order
        const remainingCount = MAX_PARAGRAPHS - relevantParagraphs.length;
        const remainingParagraphs = paragraphs
          .filter((para) => !relevantParagraphs.some((p) => p.text === para))
          .slice(0, remainingCount);
        // Combine relevant and remaining paragraphs, sort by original position
        const allSelectedParagraphs = [
          ...relevantParagraphs.map((p) => p.text),
          ...remainingParagraphs,
        ];
        // Sort to maintain document flow
        const reorderedParagraphs = allSelectedParagraphs.sort((a, b) => {
          return paragraphs.indexOf(a) - paragraphs.indexOf(b);
        });
        processedContext = reorderedParagraphs.join("\n\n");
      } else {
        // We have enough relevant paragraphs
        processedContext = relevantParagraphs.map((p) => p.text).join("\n\n");
      }
    }

    // If we couldn't process context properly, use original context
    const finalContext = processedContext || context || "";
    // Include context only if available
    const contextSection = finalContext
      ? `Context from document:\n${finalContext}\n`
      : "No context provided from the selected document.\n";
    return `
      You are Oliver, an AI Sales & Marketing Expert.
      Core Rule: Answer SOLELY using the provided context from the user's selected document. Never invent features, steps, or capabilities.
      ${contextSection}
      User Request: ${trimmedQuestion}
      Response Workflow:
      1. **Check for Context**:
         - If no context: "I don't have enough information from the selected document to answer that."
         - If context exists: Proceed below.
      2. **Determine Request Type**:
         - **Email Request**: Generate a persuasive cold outreach email using ONLY product/service details, target audience, and value propositions from the context.
         - **Social Media Request**: Design an engaging post for the specified platform using key messaging and brand voice from the context.
         - **Competitor Analysis**: Compare ONLY competitors/strategies named in the context, highlighting documented strengths/weaknesses.
         - **General/Document Questions**: Provide a step-by-step explanation ONLY if the context describes feature functionality, setup, or configuration. If not: "This isn't covered in the selected document."
      3. **Universal Rules**:
         - Never assume undocumented features or provide generic instructions (e.g., "log in").
         - Structure responses with headers (e.g., **Cold Email**, **Step 1**).
         - Keep answers under 150 words unless technical depth is required.
    `;
  },
  debug: true,
});
// Helper function to extract key terms from a question
function extractKeyTerms(question) {
  // Remove stop words and keep meaningful terms
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "in",
    "on",
    "at",
    "by",
    "for",
    "with",
    "about",
    "to",
    "and",
    "or",
    "but",
    "if",
    "how",
    "what",
    "when",
    "where",
    "who",
    "why",
  ]);
  // Extract potential keywords
  return question
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((word) => !stopWords.has(word) && word.length > 3);
}
