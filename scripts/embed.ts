import { FerrisEpisode, FerrisJSON } from "@/types";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { Configuration, OpenAIApi } from "openai";

loadEnvConfig("");

const generateEmbeddings = async (episodes: FerrisEpisode[]) => {
  const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
  const openai = new OpenAIApi(configuration);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  for (let i = 55; i < episodes.length; i++) {
    const section = episodes[i];

    for (let j = 0; j < section.chunks.length; j++) {
      const chunk = section.chunks[j];

      const { episode_title, episode_url, episode_date, episode_thanks, content, content_length, content_tokens } = chunk;

      const host_name = "Tim Ferris";
      const episode_id = i
      const chunk_id = j

      //check if episode is already in supabase based on url, content_length, and content_tokens
      const { data: existing, error: existingError } = await supabase
        .from("episode-embeddings")
        .select("*")
        .eq("episode_url", episode_url)
        .eq("content_length", content_length)
        .eq("content_tokens", content_tokens);

      let embedding = null;
    
      //if episode isn't in supabase then embed it
      if (existing == null || existing.length == 0) {
        const embeddingResponse = await openai.createEmbedding({
          model: "text-embedding-ada-002",
          input: content
        });
        [{ embedding }] = embeddingResponse.data.data;
        
        //now insert the embedding into supabase
        const { data, error } = await supabase
          .from("episode-embeddings")
          .insert({
            episode_title,
            episode_url,
            episode_date,
            content,
            content_length,
            content_tokens,
            embedding,
            host_name,
            episode_id,
            chunk_id
          })
          .select("*");

          if (error) {
            console.log("error", error);
          } else {
            console.log("saved new embedding", i, j, episode_url);
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        console.log("already in supabase", i, j, episode_url);
        //if episode is in supabase then make the embedding the existing embedding in supabase
        embedding = existing[0].embedding;

        //now update the embedding in supabase
        const { data, error } = await supabase
          .from("episode-embeddings")
          .update({
            episode_title,
            episode_url,
            episode_date,
            content,
            content_length,
            content_tokens,
            embedding,
            host_name,
            episode_id,
            chunk_id
          })
          .eq("id", existing[0].id )

          if (error) {
            console.log("error", error);
          } else {
            console.log("updated", i, j, episode_url);
          }
      }


    }
  }
};

(async () => {
  //const book: FerrisJSON = JSON.parse(fs.readFileSync("transcripts/index.json", "utf8"));

  //for each file in /transcripts directory, load the json file and push it to the episodes array
  const files = fs.readdirSync("transcripts");
  const episodes = [];
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    if (filename !== "index.json") {
    episodes.push(JSON.parse(fs.readFileSync(`transcripts/${filename}`, "utf8")));
    };
  }
  await generateEmbeddings(episodes);
})();
