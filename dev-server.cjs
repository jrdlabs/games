// Local preview only; GitHub Pages serves the production files directly.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
http.createServer((req,res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(__dirname, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(__dirname + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err,data) => { res.writeHead(err ? 404 : 200, { 'Content-Type':types[path.extname(file)] || 'text/plain' }); res.end(err ? 'Not found' : data); });
}).listen(8080,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8080'));
