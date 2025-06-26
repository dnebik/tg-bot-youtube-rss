import { Telegraf } from "telegraf";
import * as process from "node:process";
import { getUserByTgId } from "@/helpers/getUserByTgId";
import { subscribeToYouTubeChannel } from "@/service/youtube";
import { youtubeEvents } from "@/service/youtube-rss";
import { Channel, Video } from "@/generated/prisma";
import prisma from "@/service/prisma";

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is not defined");
}

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "Привет!\nЗдесь ты можешь подписаться на рассылку о новых видио с каналов на Youtube.\n\n\nЧтобы оформить подписку воспользуйся командой `/sub [ссылка на канал]`\n\nЧтобы просмотреть список твоих активных подписок напиши `/subs`\n\nДля удаления подписки воспользуйся командой `/rm [номер из списка]`",
    {
      parse_mode: "Markdown",
    },
  );
});

bot.command("sub", async (ctx) => {
  const command = ctx.message.text.split(" ")[1];
  if (!command)
    return ctx.reply(
      "Укажи ссылку на канал. Пример: /subscribe https://www.youtube.com/@LinusTechTips",
    );

  console.log(command);

  try {
    const user = await getUserByTgId(String(ctx.chat.id));
    await subscribeToYouTubeChannel(user.id, command);
    ctx.reply("Подписка оформлена");
  } catch (e) {
    const defaultMessage = "Не удалось обработать ссылочку :c";
    if (!(e instanceof Error)) return ctx.reply(defaultMessage);

    const message = e.message || defaultMessage;
    return ctx.reply(message);
  }
});

bot.command("subs", async (ctx) => {
  const subs = await prisma.subscription.findMany({
    where: {
      user: {
        telegramId: String(ctx.chat.id),
      },
    },
    include: {
      channel: true,
    },
  });

  if (!subs.length) {
    ctx.reply("У тебя нет подписок");
    return;
  }

  let message = "Твои подписки: ";
  let index = 0;

  for (const sub of subs) {
    message += `\n  [${index + 1}]: <a href="https://youtube.com/@${sub.channel.channelName}">${sub.channel.title}</a>  <code>/rm ${index + 1}</code>`;
    index++;
  }

  await bot.telegram.sendMessage(ctx.chat.id, message, {
    parse_mode: "HTML",
    link_preview_options: {
      is_disabled: true,
    },
  });
});

bot.command("rm", async (ctx) => {
  const index = Number(ctx.message.text.split(" ")[1]);
  if (Number.isNaN(index)) {
    ctx.reply("Укажите номер подписки для удаления. Пример /remove 1");
    return;
  }

  const sub = await prisma.subscription.findFirst({
    skip: index - 1,
    take: 1,
    where: {
      user: {
        telegramId: String(ctx.chat.id),
      },
    },
    include: {
      channel: true,
    },
  });

  if (!sub) {
    ctx.reply(
      "Не удалось найти подписку с данным номером. Уточните номер подписки командой /subscriptions",
    );
    return;
  }

  await prisma.subscription.delete({
    where: {
      id: sub.id,
    },
  });

  ctx.reply("Подписка удалена");
});

async function handleVideoAdded(video: Video, channel: Channel) {
  const users = await prisma.user.findMany({
    where: {
      subscriptions: {
        some: {
          channelId: channel.id,
        },
      },
    },
  });

  if (!users.length) return;

  for (const user of users) {
    const message = `Новое видео на канале ${channel.title}!\n${video.title}\n${video.url}`;

    await bot.telegram.sendMessage(user.telegramId, message, {
      parse_mode: "HTML",
      link_preview_options: {
        is_disabled: false,
      },
    });
  }
}

youtubeEvents.add("video-added", handleVideoAdded);

export function startBot() {
  bot.launch();
}
