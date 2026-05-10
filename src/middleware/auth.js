import jwt from 'jsonwebtoken';

/**
 * Middleware obrigatório — rejeita qualquer requisição sem token válido.
 * Uso: router.get('/rota', authenticate, handler)
 */
export function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não informado.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Token expirado. Faça login novamente.'
      : 'Token inválido.';
    return res.status(401).json({ error: msg });
  }
}

/**
 * Middleware opcional — lê o token se presente, mas não bloqueia se ausente.
 * Popula req.user quando autenticado, deixa undefined caso contrário.
 * Uso: rotas públicas que têm comportamento diferente para logados.
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
  } catch {
    // token inválido/expirado em rota pública — ignora silenciosamente
  }
  next();
}

function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7); // mais seguro que split(' ')[1]
  }
  return null;
}
