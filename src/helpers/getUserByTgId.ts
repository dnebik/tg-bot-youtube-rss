import prisma from "@/service/prisma";

export async function getUserByTgId(id: string) {
  const user = await prisma.user.findUnique({
    where: {
      telegramId: id,
    },
  });
  if (!user) {
    return prisma.user.create({
      data: {
        telegramId: id,
      },
    });
  }
  return user;
}
