import app from '../backend/src/app.js';

export default function handler(req, res) {
  const apiPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
  const query = new URLSearchParams();
  Object.entries(req.query).forEach(([key, value]) => {
    if (key === 'path') return;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value != null) query.set(key, value);
  });
  req.url = `/api/${apiPath || ''}${query.size ? `?${query}` : ''}`;
  return app(req, res);
}
