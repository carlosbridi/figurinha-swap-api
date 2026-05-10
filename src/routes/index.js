import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { register, login, me, updateMe, publicProfile } from '../controllers/authController.js';
import {
  listStickers, myStickers, createSticker, updateSticker, deleteSticker, listCountries
} from '../controllers/stickerController.js';
import { myTrades, createTrade, respondTrade, cancelTrade } from '../controllers/tradeController.js';

const router = Router();

// ── Auth ──────────────────────────────────────────────────────
// Públicas por natureza (são o ponto de entrada)
router.post ('/auth/register', register);
router.post ('/auth/login',    login);
// Privadas — exigem token válido
router.get  ('/auth/me',  authenticate, me);
router.patch('/auth/me',  authenticate, updateMe);

// ── Perfil público ────────────────────────────────────────────
// optionalAuth: retorna dados públicos para todos;
// se logado, o controller pode futuramente personalizar a resposta
router.get('/users/:id/profile', optionalAuth, publicProfile);

// ── Países ────────────────────────────────────────────────────
// Público — lista de seleções não tem dado sensível
router.get('/countries', listCountries);

// ── Figurinhas ────────────────────────────────────────────────
// GET /stickers — público: qualquer um pode ver figurinhas disponíveis para troca
router.get   ('/stickers',      optionalAuth, listStickers);
// Todas as demais operações exigem autenticação
router.get   ('/stickers/mine', authenticate, myStickers);
router.post  ('/stickers',      authenticate, createSticker);
router.patch ('/stickers/:id',  authenticate, updateSticker);
router.delete('/stickers/:id',  authenticate, deleteSticker);

// ── Negociações ───────────────────────────────────────────────
// Todas privadas — nenhuma operação de troca é pública
router.get   ('/trades',             authenticate, myTrades);
router.post  ('/trades',             authenticate, createTrade);
router.patch ('/trades/:id/respond', authenticate, respondTrade);
router.delete('/trades/:id',         authenticate, cancelTrade);

export default router;
