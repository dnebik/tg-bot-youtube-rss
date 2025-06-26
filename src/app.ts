import "dotenv/config";
import { startBot } from "@/service/bot";
import { startYoutubeRss } from "@/service/youtube-rss";

startBot();
startYoutubeRss();

console.log("🚀 Bot started successfully!");
