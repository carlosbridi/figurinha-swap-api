import pool from '../models/db.js';

// ── GET /trades ───────────────────────────────────────────────
export async function myTrades(req, res) {
  try {
    const result = await pool.query(
      `SELECT
         t.id,
         t.requester_id,
         t.receiver_id,
         t.offered_sticker,
         t.wanted_sticker,
         t.status,
         t.message,
         t.requester_share_phone,
         t.receiver_share_phone,
         t.created_at,
         u_req.name  AS requester_name,
         u_rec.name  AS receiver_name,
         -- Celular do requerente: só exibido se troca aceita + optou por compartilhar
         CASE WHEN t.status = 'accepted' AND t.requester_share_phone THEN u_req.phone ELSE NULL END AS requester_phone,
         -- Celular do receptor: só exibido se troca aceita + optou por compartilhar
         CASE WHEN t.status = 'accepted' AND t.receiver_share_phone  THEN u_rec.phone ELSE NULL END AS receiver_phone,
         s_off.player_name  AS offered_player,
         s_off.shirt_number AS offered_shirt,
         c_off.flag         AS offered_flag,
         c_off.name         AS offered_country,
         s_wnt.player_name  AS wanted_player,
         s_wnt.shirt_number AS wanted_shirt,
         c_wnt.flag         AS wanted_flag,
         c_wnt.name         AS wanted_country
       FROM trades t
       JOIN users     u_req ON u_req.id = t.requester_id
       JOIN users     u_rec ON u_rec.id = t.receiver_id
       JOIN stickers  s_off ON s_off.id = t.offered_sticker
       JOIN stickers  s_wnt ON s_wnt.id = t.wanted_sticker
       JOIN countries c_off ON c_off.id = s_off.country_id
       JOIN countries c_wnt ON c_wnt.id = s_wnt.country_id
       WHERE t.requester_id = $1 OR t.receiver_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    return res.json({ trades: result.rows });
  } catch (err) {
    console.error('Erro em myTrades:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── POST /trades ──────────────────────────────────────────────
export async function createTrade(req, res) {
  const { offered_sticker, wanted_sticker, message, share_phone = false } = req.body;

  if (!offered_sticker || !wanted_sticker) {
    return res.status(400).json({ error: 'Informe offered_sticker e wanted_sticker.' });
  }

  try {
    const wantedResult = await pool.query(
      'SELECT user_id FROM stickers WHERE id = $1',
      [wanted_sticker]
    );
    if (!wantedResult.rows.length) {
      return res.status(404).json({ error: 'Figurinha desejada não encontrada.' });
    }

    const receiverId = wantedResult.rows[0].user_id;
    if (receiverId === req.user.id) {
      return res.status(400).json({ error: 'Você não pode propor troca com você mesmo.' });
    }

    const offeredResult = await pool.query(
      'SELECT user_id FROM stickers WHERE id = $1 AND status = $2',
      [offered_sticker, 'have']
    );
    if (!offeredResult.rows.length || offeredResult.rows[0].user_id !== req.user.id) {
      return res.status(400).json({ error: 'A figurinha ofertada não pertence a você ou não está disponível.' });
    }

    const result = await pool.query(
      `INSERT INTO trades
         (requester_id, receiver_id, offered_sticker, wanted_sticker, message, requester_share_phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, receiverId, offered_sticker, wanted_sticker, message || null, Boolean(share_phone)]
    );
    return res.status(201).json({ trade: result.rows[0] });
  } catch (err) {
    console.error('Erro em createTrade:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── PATCH /trades/:id/respond ─────────────────────────────────
export async function respondTrade(req, res) {
  const { id } = req.params;
  const { action, share_phone = false } = req.body;

  if (!['accepted', 'rejected'].includes(action)) {
    return res.status(400).json({ error: 'Ação deve ser "accepted" ou "rejected".' });
  }

  try {
    const check = await pool.query(
      'SELECT * FROM trades WHERE id = $1 AND receiver_id = $2 AND status = $3',
      [id, req.user.id, 'pending']
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: 'Negociação não encontrada ou não está pendente.' });
    }

    // receiver_share_phone só faz sentido ao aceitar
    const receiverSharePhone = action === 'accepted' ? Boolean(share_phone) : false;

    const result = await pool.query(
      'UPDATE trades SET status=$1, receiver_share_phone=$2 WHERE id=$3 RETURNING *',
      [action, receiverSharePhone, id]
    );
    return res.json({ trade: result.rows[0] });
  } catch (err) {
    console.error('Erro em respondTrade:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

// ── DELETE /trades/:id ────────────────────────────────────────
export async function cancelTrade(req, res) {
  const { id } = req.params;

  try {
    const check = await pool.query(
      'SELECT * FROM trades WHERE id = $1 AND requester_id = $2 AND status = $3',
      [id, req.user.id, 'pending']
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: 'Negociação não encontrada ou não pode ser cancelada.' });
    }

    await pool.query('UPDATE trades SET status=$1 WHERE id=$2', ['cancelled', id]);
    return res.status(204).send();
  } catch (err) {
    console.error('Erro em cancelTrade:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}
