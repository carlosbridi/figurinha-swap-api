import pool from '../models/db.js';

// ── GET /stickers?status=have|want&country_id=&search= ────────
export async function listStickers(req, res) {
  const { status, country_id, search, user_id } = req.query;

  let query = `SELECT * FROM v_stickers WHERE 1=1`;
  const params = [];

  if (status) {
    params.push(status);
    query += ` AND status = $${params.length}`;
  }
  if (country_id) {
    params.push(country_id);
    query += ` AND country_id = $${params.length}`;
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    query += ` AND LOWER(player_name) LIKE $${params.length}`;
  }
  if (user_id) {
    params.push(user_id);
    query += ` AND user_id = $${params.length}`;
  }

  query += ` ORDER BY created_at DESC`;

  try {
    const result = await pool.query(query, params);
    return res.json({ stickers: result.rows });
  } catch (err) {
    console.error('Erro em listStickers:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── GET /stickers/mine ────────────────────────────────────────
export async function myStickers(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM v_stickers WHERE user_id = $1 ORDER BY country_name, shirt_number`,
      [req.user.id]
    );
    return res.json({ stickers: result.rows });
  } catch (err) {
    console.error('Erro em myStickers:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── POST /stickers ────────────────────────────────────────────
export async function createSticker(req, res) {
  const { country_id, player_name, shirt_number, status, quantity = 1, notes } = req.body;

  if (!country_id || !player_name || !shirt_number || !status) {
    return res.status(400).json({ error: 'Campos obrigatórios: country_id, player_name, shirt_number, status.' });
  }
  if (!['have', 'want'].includes(status)) {
    return res.status(400).json({ error: 'Status deve ser "have" (tenho) ou "want" (preciso).' });
  }
  if (shirt_number < 1 || shirt_number > 99) {
    return res.status(400).json({ error: 'Número da camisa deve ser entre 1 e 99.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO stickers (user_id, country_id, player_name, shirt_number, status, quantity, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, country_id, player_name.trim(), shirt_number, status, quantity, notes || null]
    );
    return res.status(201).json({ sticker: result.rows[0] });
  } catch (err) {
    console.error('Erro em createSticker:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── PATCH /stickers/:id ───────────────────────────────────────
export async function updateSticker(req, res) {
  const { id } = req.params;
  const { player_name, shirt_number, status, quantity, notes } = req.body;

  try {
    const check = await pool.query('SELECT user_id FROM stickers WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Figurinha não encontrada.' });
    if (check.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão.' });

    const result = await pool.query(
      `UPDATE stickers
       SET player_name=$1, shirt_number=$2, status=$3, quantity=$4, notes=$5
       WHERE id=$6
       RETURNING *`,
      [player_name.trim(), shirt_number, status, quantity, notes || null, id]
    );
    return res.json({ sticker: result.rows[0] });
  } catch (err) {
    console.error('Erro em updateSticker:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── DELETE /stickers/:id ──────────────────────────────────────
export async function deleteSticker(req, res) {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verifica dono
    const check = await client.query('SELECT user_id FROM stickers WHERE id = $1', [id]);
    if (!check.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Figurinha não encontrada.' });
    }
    if (check.rows[0].user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Sem permissão.' });
    }

    // Cancela trocas pendentes que envolvem esta figurinha
    const cancelled = await client.query(
      `UPDATE trades
         SET status = 'cancelled'
       WHERE status = 'pending'
         AND (offered_sticker = $1 OR wanted_sticker = $1)
       RETURNING id`,
      [id]
    );

    // Remove a figurinha
    await client.query('DELETE FROM stickers WHERE id = $1', [id]);

    await client.query('COMMIT');

    return res.status(200).json({
      cancelled_trades: cancelled.rowCount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro em deleteSticker:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client.release();
  }
}

// ── GET /countries ────────────────────────────────────────────
export async function listCountries(req, res) {
  try {
    const result = await pool.query('SELECT * FROM countries ORDER BY name');
    return res.json({ countries: result.rows });
  } catch (err) {
    console.error('Erro em listCountries:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}
