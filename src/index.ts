// server.ts (или app.js)
import express from "express";
import bodyParser from "body-parser";

const app = express();
const PORT = 3000;

// Используем bodyParser для парсинга XML в raw-виде
app.use('/youtube-webhook', bodyParser.text({ type: 'application/atom+xml' }));

// 1. Обработка проверки подписки от хаба
app.get('/youtube-webhook', (req, res) => {
  const challenge = req.query['hub.challenge'];
  console.log('🔑 Challenge received:', challenge);
  res.status(200).send(challenge);
});

// 2. Обработка уведомлений (новые видео и т.д.)
app.post('/youtube-webhook', (req, res) => {
  const rawXml = req.body;
  console.log('📨 New notification:', rawXml);

  // Можно разобрать XML здесь, например с xml2js
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook server running on http://localhost:${PORT}`);
});
