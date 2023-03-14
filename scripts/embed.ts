import { FerrisEpisode, FerrisJSON } from "@/types";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { Configuration, OpenAIApi } from "openai";

loadEnvConfig("");

//embed the content with openAI and return the embedding, try max 3 times
const embedWithOpenAI = async (content: string, attempt = 0) => {
  //if we've tried 3 times then return null
  if (attempt > 3) {  
    return null;
  }

  const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
  const openai = new OpenAIApi(configuration);

  let embeddingResponse = null;
  let embedding = null;

  try {
    const embeddingResponse = await openai.createEmbedding({
      model: "text-embedding-ada-002",
      input: content
    });
    [{ embedding }] = embeddingResponse.data.data;
  } catch (error) {
    console.log("error", error);
    console.log("retrying in 2 seconds");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    //retry recursively
    return embedWithOpenAI(content, attempt + 1);
  }
  return embedding;
}

const generateEmbeddings = async (episodes: FerrisEpisode[]) => {
  
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  for (let i = 140; i < episodes.length; i++) {
    const section = episodes[i];


    for (let j = 0; j < section.chunks.length; j++) {
      const chunk = section.chunks[j];

      const { episode_title, episode_url, episode_date, episode_thanks, content, content_length, content_tokens } = chunk;

      const host_name = "Tim Ferris";
      const episode_id = i
      const chunk_id = j

      //check if episode is already in supabase based on episode_id and chunk_id then skip to the next episode
      const { data: existing, error: existingError } = await supabase
        .from("episode_embeddings")
        .select("*")
        .eq("episode_id", episode_id)
        .eq("chunk_id", chunk_id)

      let embedding = null
    
      //if episode isn't in supabase then embed it
      if (existing == null || existing.length == 0) {
        //embed the content, but catch errors from openAI and wait an retry
        embedding = await embedWithOpenAI(content);
        //now insert the embedding into supabase
        const { data, error } = await supabase
          .from("episode_embeddings")
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

        //if the episode exists then just skip to the next episode.
        j = section.chunks.length
        //if episode is in supabase then make the embedding the existing embedding in supabase
        // embedding = existing[0].embedding;

        // //now update the embedding in supabase
        // const { data, error } = await supabase
        //   .from("episode_embeddings")
        //   .update({
        //     episode_title,
        //     episode_url,
        //     episode_date,
        //     content,
        //     content_length,
        //     content_tokens,
        //     embedding,
        //     host_name,
        //     episode_id,
        //     chunk_id
        //   })
        //   .eq("id", existing[0].id )

        //   if (error) {
        //     console.log("error", error);
        //   } else {
        //     console.log("updated", i, j, episode_url);
        //   }
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
