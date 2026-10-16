const configuredApiUrl = process.env.DJANGO_API_URL?.trim() || 'http://127.0.0.1:8000';

// Django's development server is commonly bound to 127.0.0.1. Normalizing
// localhost avoids Node resolving it to ::1 while Django listens on IPv4 only.
export const DJANGO_API_URL = configuredApiUrl
  .replace(/^http:\/\/localhost(?=:\d+|\/|$)/i, 'http://127.0.0.1')
  .replace(/\/+$/, '');
