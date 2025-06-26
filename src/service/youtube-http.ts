import { http } from "@/service/http";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

if (!YOUTUBE_API_KEY) {
  throw new Error("YOUTUBE_API_KEY is not defined");
}

export const youtubeHttp = http.create({
  baseURL: "https://content-youtube.googleapis.com/youtube/v3",
  params: {
    key: YOUTUBE_API_KEY,
  },
});
