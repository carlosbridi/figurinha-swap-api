import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Segurança: headers HTTP ───────────────────────────────────
// Helmet define ~15 headers defensivos automaticamente:
// X-Content-Type-Options, X-Frame-Options, HSTS, CSP, etc.
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Permite requisições sem origin (mobile apps, curl em dev)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parser com limite de tamanho ─────────────────────────
// Bloqueia payloads gigantes (proteção contra DoS por body)
app.use(express.json({ limit: '64kb' }));

// ── Rate limiting global ──────────────────────────────────────
// Máx. 100 requisições por IP a cada 15 minutos em qualquer rota
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,   // envia RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
app.use('/api', globalLimiter);

app.set('trust proxy', 1);

// ── Rate limiting estrito para auth ───────────────────────────
// Máx. 10 tentativas de login/registro por IP a cada 15 minutos
// Dificulta ataques de força bruta e credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de autenticação. Aguarde 15 minutos.' },
});
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Health check (sem rate limit) ────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

// ── Rotas da API ──────────────────────────────────────────────
app.use('/api', routes);

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ── Error handler global ──────────────────────────────────────
// Captura erros lançados por middlewares (ex: CORS, body parser)
// Evita que stack traces vazem para o cliente em produção
app.use((err, _req, res, _next) => {
  console.error('Erro não tratado:', err);
  const status  = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor.'
    : err.message;
  res.status(status).json({ error: message });
});

// ── Inicializa ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Origins permitidas: ${allowedOrigins.join(', ')}`);
});
