import axios from "axios";

export const embedText = async (text) => {
  const response = await axios.post(
    "https://api.together.xyz/v1/embeddings",
    {
      model: "togethercomputer/m2-bert-embedding-2",
      input: [text],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.data[0].embedding;
};
