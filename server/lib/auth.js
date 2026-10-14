import jwt from 'jsonwebtoken';
const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export function signAdmin(email) {
  return jwt.sign({ role: 'admin', email }, SECRET, { expiresIn: '12h' });
}
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { req.admin = jwt.verify(token, SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid or expired session' }); }
}
