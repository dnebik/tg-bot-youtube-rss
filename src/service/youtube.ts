import { youtubeHttp } from "@/service/youtube-http";
import prisma from "@/service/prisma";

export async function subscribeToYouTubeChannel(userId: number, url: string) {
  const channel = await getChannelByUrl(url);

  const isHasSub = await prisma.subscription.findFirst({
    where: {
      userId,
      channelId: channel.id,
    },
  });

  if (isHasSub) throw new Error("Данный канал уже в ваших подписках");

  await prisma.subscription.create({
    data: {
      channelId: channel.id,
      userId: userId,
    },
  });
}

async function getChannelByUrl(url: string) {
  const channelName = extractYouTubeChannelName(url);
  const cannotFindMessage = `Канал ${channelName} не удалось найти`;

  const channelFromDb = await prisma.channel.findFirst({
    where: {
      channelName: channelName.toLowerCase(),
    },
  });

  if (channelFromDb) return channelFromDb;

  // поиск канала
  const response = await youtubeHttp
    .get("/search", {
      params: {
        q: channelName,
        part: "snippet",
        type: "channel",
        maxResults: 1,
      },
    })
    .catch((e) => {
      console.error(e);
      throw new Error("Апи поломалось :c\nОбратись к @dnebik");
    });

  const items = response.data.items;
  if (items.length === 0) throw new Error(cannotFindMessage);

  const closest = items[0];
  const channelId = closest.snippet.channelId;

  // Инфа о канале
  const detailsRes = await youtubeHttp.get("/channels", {
    params: {
      part: "snippet,brandingSettings",
      id: channelId,
    },
  });

  console.log(detailsRes.data.items?.[0]);

  const channelData = detailsRes.data.items?.[0];
  if (!channelData) throw new Error(cannotFindMessage);

  const snippet = channelData.snippet;

  // Проверяем кастомный URL (brandingSettings.channel.customUrl)
  const customUrl = snippet.customUrl.replace(/^@/, "");

  if (customUrl.toLowerCase() !== channelName.toLowerCase())
    throw new Error(`Канал ${channelName} не удалось найти`);

  const realName = snippet.title;

  return prisma.channel.create({
    data: {
      channelName: customUrl,
      youtubeId: channelId,
      title: realName,
    },
  });
}

function extractYouTubeChannelName(url: string) {
  const parsedUrl = new URL(url);

  // Проверка домена
  const host = parsedUrl.hostname.replace(/^www\./, "");
  if (!["youtube.com", "m.youtube.com"].includes(host)) {
    throw new Error("Ссылка не соответсвует адресу youtube");
  }

  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  if (pathSegments[0].startsWith("@")) {
    const channelName = pathSegments[0]; // Хендл канала
    if (channelName) return channelName.replace(/^@/, "");
  }

  throw new Error("Не удалось получить имя канала");
}
