export enum OpenAIModel {
  DAVINCI_TURBO = "gpt-3.5-turbo"
}

export type FerrisEpisode = {
  title: string;
  url: string;
  date: string;
  thanks: string;
  content: string;
  length: number;
  tokens: number;
  chunks: FerrisChunk[];
};

export type FerrisChunk = {
  episode_title: string;
  episode_url: string;
  episode_date: string;
  episode_thanks: string;
  content: string;
  content_length: number;
  content_tokens: number;
  embedding: number[];
};

export type FerrisJSON = {
  current_date: string;
  author: string;
  url: string;
  length: number;
  tokens: number;
  files: string[];
};
