import { FerrisChunk, FerrisEpisode, FerrisJSON } from "@/types";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import { encode } from "gpt-3-encoder";

const BASE_URL = "http://tim.blog/category/the-tim-ferriss-show-transcripts/";
const CHUNK_SIZE = 200;

const getLinks = async () => {
  const html = await axios.get(`${BASE_URL}`);
  const $ = cheerio.load(html.data);
  const tables = $("table");

  const linksArr: { url: string; title: string }[] = [];

  tables.each((i, table) => {
    if (i === 2) {
      const links = $(table).find("a");
      links.each((i, link) => {
        const url = $(link).attr("href");
        const title = $(link).text();

        if (url && url.endsWith(".html")) {
          const linkObj = {
            url,
            title
          };

          linksArr.push(linkObj);
        }
      });
    }
  });
  
  return linksArr;
};

// function gets all the links to the episodes and takes url as input for first next page
const getEpisodeLinks = async (url: string) => {
  const html = await axios.get(url);
  const $ = cheerio.load(html.data);
  
  // get links to episodes that are in the 'entry-title' class
  const tables = $(".entry-title");

  const linksArr: { url: string; title: string }[] = [];

  //get every link ending in 'transcript/'
  tables.each((i, table) => {
    const links = $(table).find("a");
    links.each((i, link) => {
      const url = $(link).attr("href");
      const title = $(link).text();
      const linkObj = {
          url,
          title
        };

      linksArr.push(linkObj);
      
    });
  });

  //find the next page link and then repeat the process
  //should return string of next page link
  const nextPage = $("a").filter(function() { 
    //check if the class is next page-numbers
    return $(this).attr('class') === 'next page-numbers';
  });

  //call getLinksofEpisodes recursively until there is no next page
  if (nextPage.attr('href') !== undefined) {
    //nextLink should always be a string even if it is empty
    const nextLink: string = nextPage.attr('href') as string;
    const nextLinks = await getEpisodeLinks(nextLink);
    linksArr.push(...nextLinks);
  }

  //return all the links!
  return linksArr;

};

const getepisode = async (linkObj: { url: string; title: string }) => {
  const { title, url } = linkObj;

  let episode: FerrisEpisode = {
    title: "",
    url: "",
    date: "",
    thanks: "",
    content: "",
    length: 0,
    tokens: 0,
    chunks: []
  };

  const fullLink = url;
  const html = await axios.get(fullLink);
  const $ = cheerio.load(html.data);

  //get the episode date which is in the class 'entry-date published'
  const dateStr = $(".entry-date.published").text();

  //get the content which is in the class 'entry-content'
  const content = $(".entry-content").text();

  //clean the content to remove unnecessary spaces and new lines and html tags but keep the speaker names
  let cleanedContent = content.replace(/\s+/g, " ");
  cleanedContent = cleanedContent.replace(/\.([a-zA-Z])/g, ". $1");
  cleanedContent = cleanedContent.replace(/<[^>]*>/g, "");

  //trim the content to remove leading and trailing spaces
  const trimmedContent = cleanedContent.trim();

  episode = {
    title,
    url: fullLink,
    date: dateStr,
    thanks: "",
    content: trimmedContent,
    length: trimmedContent.length,
    tokens: encode(trimmedContent).length,
    chunks: []
  };
  return episode;
};


const chunkepisode = async (episode: FerrisEpisode) => {
  const { title, url, date, thanks, content, ...chunklessSection } = episode;

  console.log(episode.url);
  console.log(episode.title);

  let episodeTextChunks = [];

  if (encode(content).length > CHUNK_SIZE) {
    const split = content.split(". ");
    let chunkText = "";

    for (let i = 0; i < split.length; i++) {
      const sentence = split[i];
      const sentenceTokenLength = encode(sentence);
      const chunkTextTokenLength = encode(chunkText).length;

      if (chunkTextTokenLength + sentenceTokenLength.length > CHUNK_SIZE) {
        episodeTextChunks.push(chunkText);
        chunkText = "";
      }

      if (sentence.length > 0 && (sentence[sentence.length - 1].match(/[a-z0-9]/i))) {
        chunkText += sentence + ". ";
      } else {
        chunkText += sentence + " ";
      }
    }

    episodeTextChunks.push(chunkText.trim());
  } else {
    episodeTextChunks.push(content.trim());
  }

  const episodeChunks = episodeTextChunks.map((text) => {
    const trimmedText = text.trim();

    const chunk: FerrisChunk = {
      episode_title: title,
      episode_url: url,
      episode_date: date,
      episode_thanks: thanks,
      content: trimmedText,
      content_length: trimmedText.length,
      content_tokens: encode(trimmedText).length,
      embedding: []
    };

    return chunk;
  });

  if (episodeChunks.length > 1) {
    for (let i = 0; i < episodeChunks.length; i++) {
      const chunk = episodeChunks[i];
      const prevChunk = episodeChunks[i - 1];

      if (chunk.content_tokens < 100 && prevChunk) {
        prevChunk.content += " " + chunk.content;
        prevChunk.content_length += chunk.content_length;
        prevChunk.content_tokens += chunk.content_tokens;
        episodeChunks.splice(i, 1);
        i--;
      }
    }
  }

  const chunkedSection: FerrisEpisode = {
    ...episode,
    chunks: episodeChunks
  };

  return chunkedSection;
};

(async () => {
  //run getEpisodeLinks to get all the links on the $BASE_URL

  const links = await getEpisodeLinks(`${BASE_URL}`);

  let episodes = [];
  let files = [];

  for (let i = 0; i < links.length; i++) {
    
    const episode = await getepisode(links[i]);
    const chunkedepisode = await chunkepisode(episode);
    episodes.push(chunkedepisode);
    const filename = `${i}.json`;
    files.push(filename);
    //save chunkedepisode to a json file in the /transcripts directory
    fs.writeFileSync(`transcripts/${filename}`, JSON.stringify(chunkedepisode));
  }
  //for each episode, store a json file in the transcripts directory
 
  const json: FerrisJSON = {
    current_date: "2023-03-01",
    author: "Tim Ferriss",
    url: "http://tim.blog/category/the-tim-ferriss-show-transcripts/",
    length: episodes.reduce((acc, episode) => acc + episode.length, 0),
    tokens: episodes.reduce((acc, episode) => acc + episode.tokens, 0),
    files
  };


  fs.writeFileSync("scripts/index.json", JSON.stringify(json));
})();
