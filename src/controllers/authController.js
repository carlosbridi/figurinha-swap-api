import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../models/db.js';

// ── POST /auth/register ───────────────────────────────────────
export async function register(req, res) {
  const { name, email, password, city, state } = req.body;

  if (!name || !email || !password || !city || !state) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }
  if (state.length !== 2) {
    return res.status(400).json({ error: 'Informe a sigla do estado com 2 letras (ex: SC).' });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length) {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, city, state)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, city, state, phone, collection_public, created_at`,
      [name.trim(), email.toLowerCase(), hash, city.trim(), state.toUpperCase()]
    );

    const user = result.rows[0];
    const token = issueToken(user);
    return res.status(201).json({ user: sanitize(user), token });
  } catch (err) {
    console.error('Erro em register:', err);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}

// ── POST /auth/login ──────────────────────────────────────────
export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password, city, state, phone, collection_public FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = issueToken(user);
    return res.json({ user: sanitize(user), token });
  } catch (err) {
    console.error('Erro em login:', err);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}

// ── GET /auth/me ──────────────────────────────────────────────
export async function me(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, name, email, city, state, phone, collection_public, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Erro em me:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── PATCH /auth/me ────────────────────────────────────────────
export async function updateMe(req, res) {
  const { name, city, state, collection_public, phone } = req.body;

  if (!name || !city || !state) {
    return res.status(400).json({ error: 'Nome, cidade e estado são obrigatórios.' });
  }

  // Sanitiza o celular: mantém só dígitos
  const phoneSanitized = phone ? phone.replace(/\D/g, '').slice(0, 15) || null : null;

  try {
    const result = await pool.query(
      `UPDATE users SET name=$1, city=$2, state=$3, collection_public=$4, phone=$5
       WHERE id=$6
       RETURNING id, name, email, city, state, phone, collection_public`,
      [name.trim(), city.trim(), state.toUpperCase(), collection_public !== false, phoneSanitized, req.user.id]
    );
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Erro em updateMe:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── GET /users/:id/profile ────────────────────────────────────
export async function publicProfile(req, res) {
  const { id } = req.params;
  try {
    const userResult = await pool.query(
      'SELECT id, name, city, state, collection_public, created_at FROM users WHERE id = $1',
      [id]
    );
    if (!userResult.rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const user = userResult.rows[0];

    // Se a coleção for privada, retorna o perfil sem as figurinhas
    if (!user.collection_public) {
      return res.json({
        user,
        stickers: null,   // null = sinaliza que é privado
        stats: null,
      });
    }

    const stickersResult = await pool.query(
      `SELECT * FROM v_stickers WHERE user_id = $1 ORDER BY country_name, shirt_number`,
      [id]
    );

    const stickers = stickersResult.rows;
    return res.json({
      user,
      stickers,
      stats: {
        have: stickers.filter(s => s.status === 'have').length,
        want: stickers.filter(s => s.status === 'want').length,
      },
    });
  } catch (err) {
    console.error('Erro em publicProfile:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function sanitize({ password, ...user }) {
  return user;
}
