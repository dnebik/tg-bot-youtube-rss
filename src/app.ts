import "dotenv/config";
import { startBot, stopBot } from "@/service/bot";
import { startYoutubeRss, stopYoutubeRss } from "@/service/youtube-rss";
import prisma from "@/service/prisma";
import { createLogger } from "@/helpers/logger";

const log = createLogger("app");

startBot();
startYoutubeRss();

log.info("Bot started successfully");

async function shutdown() {
  log.info("Shutting down...");
  stopBot();
  stopYoutubeRss();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
