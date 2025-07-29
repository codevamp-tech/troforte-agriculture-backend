export const buildPrompt = (query, contextChunks) => {
  const context = contextChunks;
  return [
    {
      role: "system",
      content:
        "You are Troforte AI Assistant, an agronomy expert helping users understand Troforte fertilizers and soil microbes.",
    },
    {
      role: "user",
      content: `Context:\n${context}\n\nQuestion: ${query}`,
    },
  ];
};
