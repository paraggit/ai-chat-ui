import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import chatRoutes from './routes/chat.js';
import { rateLimit } from './middleware/rateLimit.js';
import { getServerProtocol, loadSSLOptions } from './utils/ssl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: '20mb' }));
app.use(rateLimit);

app.use('/api', chatRoutes);

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error('[app] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const sslOptions = loadSSLOptions();
const protocol = getServerProtocol();

if (sslOptions) {
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`HF Chat Pro server running on ${protocol}://localhost:${PORT}`);
    console.log(`SSL: enabled (self-signed)`);
    console.log(`Model: ${process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2'}`);
  });
} else {
  http.createServer(app).listen(PORT, () => {
    console.log(`HF Chat Pro server running on ${protocol}://localhost:${PORT}`);
    console.log(`Model: ${process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2'}`);
  });
}

export default app;
