import { Hono } from 'hono';

const secretKey = process.env.SECRET_KEY;

export function setupAuthentication(app: Hono) {
  app.use('*', (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Verify token with secret key
    const verified = verifyToken(token, secretKey);
    if (!verified) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return next();
  });
}

function verifyToken(token: string, secretKey: string) {
  // Implement token verification logic here
  // For example, using JSON Web Tokens (JWT)
  return true; // Replace with actual verification logic
}