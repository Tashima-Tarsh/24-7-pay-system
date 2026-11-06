import { createServer, request } from "node:http";

const port = Number(process.env.PORT || 10000);
createServer((incoming, outgoing) => {
  const path = (incoming.url || "/").split("?")[0];
  const backend = path === "/health";
  const proxy = request({
    hostname: "127.0.0.1", port: backend ? 3000 : 3100,
    path: incoming.url, method: incoming.method, headers: incoming.headers, timeout: 15000,
  }, (response) => {
    outgoing.writeHead(response.statusCode, response.headers);
    response.pipe(outgoing);
  });
  proxy.on("timeout", () => proxy.destroy());
  proxy.on("error", () => {
    if (outgoing.headersSent) return outgoing.destroy();
    outgoing.writeHead(503).end("Starting Sanbookpay");
  });
  incoming.on("aborted", () => proxy.destroy());
  incoming.pipe(proxy);
}).listen(port, "0.0.0.0");
