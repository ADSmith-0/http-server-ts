import * as net from "net";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const acceptedPaths = ["/", "/index.html", "/echo/?.*"] as const;
const r200 = "HTTP/1.1 200 OK\r\n"
const r404 = "HTTP/1.1 404 Not Found\r\n"
// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
  const response = (res: string, body: string = ""): void => {
    socket.write(res.concat(body, "\r\n"));
    socket.end();
  };
  socket.on("data", (data) => {
    const httpRequest = new TextDecoder().decode(data);
    const regex = /^(?<method>GET|POST|PUT|PATCH) (?<path>\S+) HTTP\/(?<version>\d\.\d)\r\n(?<headers>.*\r\n)\r\n$/gms.exec(httpRequest)?.groups;
    if (!regex) {
      response(r404);
      return;
    }
    const { method, path, version, headers } = regex;
    for (let i = 0; i < acceptedPaths.length; i++) {
      const acceptedPath: typeof acceptedPaths[number] = acceptedPaths[i];
      const regexp = new RegExp(`^${acceptedPath}$`);
      if (regexp.test(path)) {
        if (acceptedPath.startsWith("/echo")) {
          const endpoint = path.split("/")[2];
          if (endpoint) {
            response(r200, `Content-Type: text/plain\r\nContent-Length: ${endpoint.length}\r\n\r\n${endpoint}`);
            return;
          }
        }
        response(r200);
        return;
      }
    }
    response(r404);
  });
  socket.on("close", () => {
    socket.end();
  });
});

server.listen(4221, "localhost");
