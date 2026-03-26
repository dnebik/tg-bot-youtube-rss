import prisma from "@/service/prisma";

export async function getUserByTgId(id: string) {
  return prisma.user.upsert({
    where: { telegramId: id },
    update: {},
    create: { telegramId: id },
  });
}
