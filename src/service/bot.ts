import { Telegraf, Markup, Scenes, Context, session } from "telegraf";
import * as process from "node:process";
import { getUserByTgId } from "@/helpers/getUserByTgId";
import { subscribeToYouTubeChannel } from "@/service/youtube";
import { youtubeEvents } from "@/service/youtube-rss";
import { Channel, Video } from "@/generated/prisma";
import prisma from "@/service/prisma";
import { message } from "telegraf/filters";

interface MySessionData extends Scenes.SceneSession {
  // Можно добавить дополнительные поля сессии если нужно
}

// Определяем базовый интерфейс для контекста
interface MyContext extends Context {
  scene: Scenes.SceneContextScene<MyContext>;
  session: MySessionData;
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const ITEMS_PER_PAGE = 6;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is not defined");
}

const bot = new Telegraf<MyContext>(BOT_TOKEN);

bot.telegram.setMyCommands([
  { command: "/start", description: "О боте" },
  { command: "/subs", description: "Список подписок" },
  { command: "/sub", description: "Оформить подписку" },
]);

const keyboard = Markup.keyboard([["🆕 Подписаться", "📋 Подписки"]]).resize();

bot.start((ctx) => {
  ctx.reply(
    `
    Привет! 👋🎉
Здесь ты можешь подписаться на уведомления о новых видео с YouTube-каналов! 🎥🔔

👇 Вот как это работает:

📌 Чтобы оформить подписку, отправь команду:
<code>/sub</code>

📋 Чтобы посмотреть свои подписки, напиши:
<code>/subs</code>

Или просто воспользуйся удобными кнопками ниже! ⬇️😉

Оставайся на связи с любимыми авторами! ❤️📺
    `,
    {
      parse_mode: "HTML",
      ...keyboard,
    },
  );
});

const subscribeScene = new Scenes.BaseScene<MyContext>("subscribe");
const stage = new Scenes.Stage<MyContext>([subscribeScene]);

bot.use(session());
bot.use(stage.middleware());

// Обработчик входа в сцену
subscribeScene.enter(async (ctx) => {
  await ctx.reply(
    "📩 Отправь мне ссылку на YouTube-канал, на который хочешь подписаться!\n\n" +
      "Например: https://www.youtube.com/@LinusTechTips\n\n" +
      "❌ Чтобы отменить, просто нажми кнопку ниже 👇",
    {
      link_preview_options: {
        is_disabled: true,
      },
      ...Markup.keyboard([["❌ Отменить"]])
        .oneTime()
        .resize(),
    },
  );
});

// Обработчик отмены
subscribeScene.hears("❌ Отменить", async (ctx) => {
  await ctx.reply("Оформление подписки отменено", keyboard);
  return await ctx.scene.leave();
});

async function handleSubscribeSceneCancel(url: string, ctx: any) {
  const user = await getUserByTgId(String(ctx.chat.id));
  await subscribeToYouTubeChannel(user.id, url);
  await ctx.reply("✅ Подписка успешно оформлена!", keyboard);
}

subscribeScene.on(message("text"), async (ctx) => {
  const url = ctx.message.text;
  try {
    await handleSubscribeSceneCancel(url, ctx);
    await ctx.scene.leave();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
    ctx.reply(`😥 ${msg}\nПопробуй ещё раз или нажми «Отмена» ниже ⬇️`);
  }
});
// Добавим также обработчик для неподдерживаемых типов сообщений
subscribeScene.on(message(), async (ctx) => {
  await ctx.reply(
    "🙏 Пожалуйста, отправь ссылку на канал **в виде текста** или нажми кнопку **Отмена** ниже ⬇️",
  );
});

bot.command("sub", (ctx) => {
  return ctx.scene.enter("subscribe");
});

// Обновленный обработчик команды /subs
bot.command("subs", async (ctx) => {
  await showSubscriptionsPage(ctx, 0);
});

// Обновляем обработчик для кнопки подписки
bot.hears("🆕 Подписаться", (ctx) => {
  return ctx.scene.enter("subscribe");
});

bot.hears("📋 Подписки", async (ctx) => {
  await showSubscriptionsPage(ctx, 0);
});

// Функция для отображения страницы подписок
async function showSubscriptionsPage(ctx: any, page: number) {
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
    return ctx.reply("🔍 Подписок пока нет.\nДавай это исправим? 😉", {
      ...keyboard,
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🆕 Подписаться на канал", "subscribe")],
      ]),
    });
  }

  const totalPages = Math.ceil(subs.length / ITEMS_PER_PAGE);
  const startIndex = page * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, subs.length);
  const currentPageSubs = subs.slice(startIndex, endIndex);

  let message = "Твои подписки:\n";
  currentPageSubs.forEach((sub, idx) => {
    const globalIndex = startIndex + idx + 1;
    message += `\n${globalIndex}. <a href="https://youtube.com/@${sub.channel.channelName}">${sub.channel.title}</a>`;
  });

  message += `\n\nСтраница ${page + 1} из ${totalPages}`;

  // Создаем клавиатуру с кнопками навигации и удаления
  const keyboardInline = [];

  // Кнопки для удаления подписок
  for (let i = 0; i < currentPageSubs.length; i += 2) {
    const row = [];

    // Добавляем первую кнопку в паре
    const globalIndex1 = startIndex + i + 1;
    row.push({
      text: `❌ Удалить ${globalIndex1}`,
      callback_data: `delete_sub:${currentPageSubs[i].id}`,
    });

    // Добавляем вторую кнопку, если она есть
    if (i + 1 < currentPageSubs.length) {
      const globalIndex2 = startIndex + i + 2;
      row.push({
        text: `❌ Удалить ${globalIndex2}`,
        callback_data: `delete_sub:${currentPageSubs[i + 1].id}`,
      });
    }

    keyboardInline.push(row);
  }

  // Кнопки навигации
  const navigationRow = [];
  if (page > 0) {
    navigationRow.push({
      text: "⬅️ Назад",
      callback_data: `page:${page - 1}`,
    });
  }
  if (page < totalPages - 1) {
    navigationRow.push({
      text: "Вперед ➡️",
      callback_data: `page:${page + 1}`,
    });
  }
  if (navigationRow.length > 0) {
    keyboardInline.push(navigationRow);
  }

  await ctx.reply(message, {
    parse_mode: "HTML",
    link_preview_options: {
      is_disabled: true,
    },
    ...keyboard,
    ...Markup.inlineKeyboard(keyboardInline),
  });
}

// Обработчики callback-запросов для кнопок
bot.action(/^page:(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  await showSubscriptionsPage(ctx, page);
  await ctx.deleteMessage();
});

bot.action("subscribe", (ctx) => {
  ctx.answerCbQuery();
  return ctx.scene.enter("subscribe");
});

bot.action(/^delete_sub:(.+)$/, async (ctx) => {
  const subId = ctx.match[1];

  try {
    await prisma.subscription.delete({
      where: {
        id: Number(subId),
      },
    });

    await ctx.answerCbQuery("Подписка удалена!");

    // Показываем обновленный список на той же странице
    const currentPage = 0; // Можно добавить логику определения текущей страницы
    await showSubscriptionsPage(ctx, currentPage);
    await ctx.deleteMessage();
  } catch (error) {
    await ctx.answerCbQuery("Ошибка при удалении подписки");
  }
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
    const message = `✨ Новинка на <b>${channel.title}</b>:\n <a href="${video.url}">${video.title}</a>`;

    await bot.telegram.sendMessage(user.telegramId, message, {
      parse_mode: "HTML",
      link_preview_options: {
        is_disabled: false,
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        videoId: video.id,
      },
    });
  }
}
youtubeEvents.add("video-added", handleVideoAdded);

export function startBot() {
  bot.launch();
}

export function stopBot() {
  bot.stop();
}
