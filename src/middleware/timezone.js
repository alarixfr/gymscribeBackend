import { validateTimezone } from '../utils/validate.js';

export const timezoneMiddleware = (req, res, next) => {
  const timezone = req.headers['x-timezone'];
  if (timezone && !validateTimezone(timezone)) {
    return res.status(400).json({ error: 'Invalid timezone' });
  }
  next();
};