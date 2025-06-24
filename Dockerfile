FROM oven/bun:alpine

WORKDIR /app

COPY bun.lock package.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD bun run dev
