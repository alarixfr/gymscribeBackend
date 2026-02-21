const rateLimitStore = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now - value.resetTime > 0) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

export function rateLimit(options = {}) {
  const {
    windowsMs = 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later'
  } = options;
  
  return (req, res, next) => {
    const ip = 
      req.headers['x-forwaded-for']?.split(',')[0].trim() ||
      req.headers['x-real-api'] ||
      req.ip ||
      req.connection.remoteAddress ||
      req.socket?.remoteAddress ||
      '0.0.0.0';
      
    const now = Date.now();
    
    if (!rateLimitStore.has(ip)) {
      rateLimitStore.set(ip, {
        count: 1,
        resetTime: now + windowsMs
      });
      return next();
    }
    
    const record = rateLimitStore.get(ip);
    
    if (now > record.resetTime) {
      rateLimitStore.set(ip, {
        count: 1,
        resetTime: now + windowsMs
      });
      return next();
    }
    
    record.count++;
    
    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      
      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message,
        retryAfter: `${retryAfter} seconds`
      });
    }
    
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - record.count);
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
    
    next();
  };
}