import fs from "node:fs";
import * as net from "node:net";
import process from "node:process";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

type Response = (response: 200 | 201 | 404, body?: string) => void;

type Request = {
	method: "GET" | "POST" | "PUT" | "PATCH";
	path: string;
	httpVersion: string;
	headers: { [key: string]: string };
	body: string | undefined;
	response: Response;
};

const textPlain = (content: string): string =>
	`Content-Type: text/plain\r\nContent-Length: ${content.length}\r\n\r\n${content}`;

const requestHandler: { [key: string]: (request: Request) => void } = {
	"/": ({ response }) => {
		response(200);
	},
	"/index.html": ({ response }) => {
		response(200);
	},
	"/echo/?.*": ({ path, response }) => {
		const endpoint = path.split("/")[2];
		if (endpoint) {
			response(200, textPlain(endpoint));
		}
	},
	"/user-agent": ({ headers, response }) => {
		const userAgent = headers["User-Agent"];
		if (!userAgent) {
			response(404);
			return;
		}
		response(200, textPlain(userAgent));
	},
	"/files/.+": ({ method, path, body, response }) => {
		const directoryFlagIndex = process.argv.indexOf("--directory");
		const directory = process.argv[directoryFlagIndex + 1];
		const filename = path.split("/")[2];
		if (!filename) {
			response(404);
			return;
		}
		const filePath = directory + filename;
		switch (method) {
			case "GET": {
				try {
					const fileContent = fs.readFileSync(filePath).toString();
					response(
						200,
						`Content-Type: application/octet-stream\r\nContent-Length: ${fileContent.length}\r\n\r\n${fileContent}`,
					);
				} catch {
					response(404);
				}
				break;
			}
			case "POST": {
				try {
					if (body) {
						fs.writeFileSync(filePath, body);
						response(201);
					} else {
						response(404);
					}
				} catch {
					response(404);
				}
				break;
			}
		}
	},
} as const;

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
	const response: Response = (res, body = ""): void => {
		const message: Record<typeof res, string> = {
			200: "OK",
			201: "Created",
			404: "Not Found",
		};
		socket.write(`HTTP/1.1 ${res} ${message[res]}\r\n`.concat(body, "\r\n"));
		socket.end();
	};
	socket.on("data", (data) => {
		const httpRequest = new TextDecoder().decode(data);
		const regex =
			/^(?<method>GET|POST|PUT|PATCH) (?<path>\S+) HTTP\/(?<httpVersion>\d\.\d)\r\n(?<headers>.*\r\n)\r\n(?<body>.*)$/gms.exec(
				httpRequest,
			)?.groups;
		if (!regex) {
			response(404);
			return;
		}
		const { method, path, httpVersion, headers, body } = regex;
		const pathKey = Object.keys(requestHandler).find((handler) =>
			new RegExp(`^${handler}$`).test(path),
		);
		if (!pathKey) {
			response(404);
			return;
		}
		requestHandler[pathKey]({
			method: method as Request["method"],
			path,
			httpVersion,
			headers: Object.fromEntries(
				headers
					.split("\r\n")
					.map((header) => header.replace(" ", "").split(":")),
			),
			body,
			response,
		});
		response(404);
	});
	socket.on("close", () => {
		socket.end();
	});
});

server.listen(4221, "localhost");
