import prisma from "@/service/prisma";
import { Channel, Video } from "@/generated/prisma";
import { createEventBus } from "@/helpers/createEventBus";
import { http } from "@/service/http";
import { createLogger } from "@/helpers/logger";
import { parseStringPromise } from "xml2js";
import { sleep } from "@/helpers/sleep";
import { withRetry } from "@/helpers/retry";
import { AxiosError } from "axios";

const log = createLogger("youtube-rss");

const CONFIG = {
  pollIntervalMs: 2 * 60 * 1000, // 2 минуты между циклами
  requestDelayMs: 3000, // 3 секунды между запросами
  requestTimeoutMs: 15000, // 15 секунд таймаут
  retry: {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
  },
};

interface YouTubeVideo {
  title: string;
  link: string;
  published: string;
  author: string;
  id: string;
}

type IYoutubeEvents = {
  "video-added": [video: Video, channel: Channel];
};

export const youtubeEvents = createEventBus<IYoutubeEvents>();

let isShuttingDown = false;

function isRetriableError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    // 429 - rate limit, 5xx - server errors, network errors
    return (
      status === 429 ||
      (status !== undefined && status >= 500) ||
      error.code === "ECONNRESET" ||
      error.code === "ETIMEDOUT" ||
      error.code === "ENOTFOUND"
    );
  }
  return false;
}

function fixEntry(entry: any): YouTubeVideo {
  return {
    author: entry.author[0],
    link: entry.link[0]["$"].href,
    id: entry["yt:videoId"][0],
    published: entry.published[0],
    title: entry.title[0],
  };
}

async function getYoutubeVideosFromChannel(
  channel: Channel,
): Promise<YouTubeVideo[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.youtubeId}`;

  return withRetry(
    async () => {
      const response = await http.get(feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/rss+xml",
        },
        timeout: CONFIG.requestTimeoutMs,
      });
      const xml = await parseStringPromise(response.data);
      return (xml.feed.entry?.map(fixEntry) ?? []) as YouTubeVideo[];
    },
    {
      ...CONFIG.retry,
      shouldRetry: (error) => {
        const shouldRetry = isRetriableError(error);
        if (shouldRetry) {
          log.warn(`Retrying request for channel ${channel.title}`, {
            youtubeId: channel.youtubeId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return shouldRetry;
      },
    },
  );
}

function getAllChannelsWithActiveSubscriptions() {
  return prisma.channel.findMany({
    include: {
      subscribers: true,
    },
    where: {
      subscribers: {
        some: {},
      },
    },
  });
}

async function writeVideoToDb(
  video: YouTubeVideo,
  channel: Channel,
  notificationSent = false,
) {
  const newVideo = await prisma.video.create({
    data: {
      title: video.title,
      url: video.link,
      publishedAt: video.published,
      channelId: channel.id,
      youtubeId: video.id,
    },
  });

  if (notificationSent) {
    youtubeEvents.call("video-added", newVideo, channel);
  }

  return newVideo;
}

async function checkNewVideosInChannel(channel: Channel) {
  // Оптимизация: count вместо findFirst для проверки backfill
  const videoCount = await prisma.video.count({
    where: {
      channelId: channel.id,
    },
  });
  const isFilled = videoCount > 0;

  const videos = await getYoutubeVideosFromChannel(channel);

  if (!isFilled) {
    for (const video of videos) await writeVideoToDb(video, channel);
    log.info(`Backfilled ${videos.length} videos`, {
      channel: channel.title,
      youtubeId: channel.youtubeId,
    });
    return;
  }

  // Оптимизация: select только youtubeId вместо полных записей
  const videosInDb = await prisma.video.findMany({
    where: {
      channelId: channel.id,
    },
    select: {
      youtubeId: true,
    },
  });

  const existingIds = new Set(videosInDb.map((v) => v.youtubeId));

  for (const video of videos) {
    if (!existingIds.has(video.id)) {
      await writeVideoToDb(video, channel, true);
      log.info(`New video found: ${video.title}`, {
        channel: channel.title,
      });
    }
  }
}

async function checkNewVideosInAllChannels() {
  const channels = await getAllChannelsWithActiveSubscriptions();
  log.debug(`Checking ${channels.length} channels`);

  let successCount = 0;
  let failCount = 0;

  // Последовательные запросы с задержкой между ними
  for (const channel of channels) {
    if (isShuttingDown) {
      log.info("Shutdown requested, stopping channel checks");
      break;
    }

    try {
      await checkNewVideosInChannel(channel);
      successCount++;
    } catch (error) {
      failCount++;
      log.error(`Failed to check channel ${channel.title}`, {
        youtubeId: channel.youtubeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Задержка между запросами (кроме последнего)
    if (channels.indexOf(channel) < channels.length - 1 && !isShuttingDown) {
      await sleep(CONFIG.requestDelayMs);
    }
  }

  if (failCount > 0) {
    log.warn(`${failCount}/${channels.length} channel checks failed`);
  } else if (successCount > 0) {
    log.debug(`All ${successCount} channels checked successfully`);
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startYoutubeRss() {
  isShuttingDown = false;
  log.info(
    `Starting RSS polling, interval: ${CONFIG.pollIntervalMs / 1000}s, request delay: ${CONFIG.requestDelayMs / 1000}s`,
  );
  intervalId = setInterval(checkNewVideosInAllChannels, CONFIG.pollIntervalMs);
  checkNewVideosInAllChannels();
}

export function stopYoutubeRss() {
  isShuttingDown = true;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    log.info("RSS polling stopped");
  }
}
