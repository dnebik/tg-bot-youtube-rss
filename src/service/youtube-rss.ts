import prisma from "@/service/prisma";
import { Channel, Video } from "@/generated/prisma";
import { createEventBus } from "@/helpers/createEventBus";
import { http } from "@/service/http";
import { createLogger } from "@/helpers/logger";
import { parseStringPromise } from "xml2js";

const log = createLogger("youtube-rss");

const INTERVAL = 2 * 60 * 1000;

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

function fixEntry(entry: any): YouTubeVideo {
  return {
    author: entry.author[0],
    link: entry.link[0]["$"].href,
    id: entry["yt:videoId"][0],
    published: entry.published[0],
    title: entry.title[0],
  };
}

async function getYoutubeVideosFromChannel(channel: Channel) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.youtubeId}`;
  const response = await http.get(feedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/rss+xml",
    },
  });
  const xml = await parseStringPromise(response.data);
  return (xml.feed.entry?.map(fixEntry) ?? []) as YouTubeVideo[];
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
  const isFilled = await prisma.video.findFirst({
    where: {
      channelId: channel.id,
    },
  });

  const videos = await getYoutubeVideosFromChannel(channel);

  if (!isFilled) {
    for (const video of videos) await writeVideoToDb(video, channel);
    log.info(`Backfilled ${videos.length} videos`, {
      channel: channel.title,
      youtubeId: channel.youtubeId,
    });
    return;
  }

  const videosInDb = await prisma.video.findMany({
    where: {
      channelId: channel.id,
    },
  });

  for (const video of videos) {
    const isNew = videosInDb.every((v) => v.youtubeId !== video.id);
    if (isNew) {
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

  const results = await Promise.allSettled(
    channels.map((channel) => checkNewVideosInChannel(channel)),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    log.warn(`${failed.length}/${channels.length} channel checks failed`);
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startYoutubeRss() {
  log.info(`Starting RSS polling, interval: ${INTERVAL / 1000}s`);
  intervalId = setInterval(checkNewVideosInAllChannels, INTERVAL);
  checkNewVideosInAllChannels();
}

export function stopYoutubeRss() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    log.info("RSS polling stopped");
  }
}
