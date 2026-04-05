import http from 'http';

// Helper: make HTTP GET request to a local server
export function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

// Helper: start a real HTTP server on a random port
export function startServer(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// Helper: close a running HTTP server
export function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}
