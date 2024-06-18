import * as net from "net";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const acceptedPaths: string[] = ["/", "/index.html"];
const r200 = "HTTP/1.1 200 OK\r\n\r\n"
const r404 = "HTTP/1.1 404 Not Found\r\n\r\n"
// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
  socket.on("data", (data) => {
    const httpRequest = new TextDecoder().decode(data);
    const [request, ...headers] = httpRequest.split("\r\n");
    const regex = /^GET (?<path>.*) HTTP\/1.1/.exec(request)?.groups;
    const path = regex?.path;
    if (!path) {
      socket.write(r404);
    }
    for (let i = 0; i < acceptedPaths.length; i++) {
      const acceptedPath = acceptedPaths[i];
      if (acceptedPath === path) {
        socket.write(r200);
        return;
      }
    }
    socket.write(r404);
  });
  socket.on("close", () => {
    socket.end();
  });
});

server.listen(4221, "localhost");
