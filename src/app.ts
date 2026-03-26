import "dotenv/config";
import { startBot, stopBot } from "@/service/bot";
import { startYoutubeRss, stopYoutubeRss } from "@/service/youtube-rss";
import prisma from "@/service/prisma";

startBot();
startYoutubeRss();

console.log("🚀 Bot started successfully!");

async function shutdown() {
  console.log("Shutting down...");
  stopBot();
  stopYoutubeRss();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
