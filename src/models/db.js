import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Plataformas como Render, Railway e Supabase fornecem DATABASE_URL
// como string única. Fallback para variáveis individuais em dev local.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // Em produção (Render/Railway/Supabase) a conexão é via SSL
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  : new Pool({
      host:     process.env.DB_HOST,
      port:     Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max:      10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do banco:', err);
});

export default pool;
