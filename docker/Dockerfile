FROM oven/bun:alpine

WORKDIR /app

COPY ../bun.lock package.json ./
RUN bun install

COPY . .

CMD bun run dev
