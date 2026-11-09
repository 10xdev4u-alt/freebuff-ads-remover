const routes = ['/api/monetize', '/healthz', '/api/ad/policy'];
for (const r of routes) fetch('http://127.0.0.1:5174' + r, { method: 'POST' });
