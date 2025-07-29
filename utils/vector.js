import { Index } from "@upstash/vector";
import "dotenv/config";

const vector = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

export async function queryVectorStore(query) {
  const results = await vector.query({
    data: query,
    topK: 3,
    includeMetadata: true,
    includeData: true,
  });
  console.log("results", results);
  const context = results.map((doc) => doc.data).join("\n");
  return context;
}
