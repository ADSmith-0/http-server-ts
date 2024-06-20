import * as net from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { argv } from "node:process";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

type Response = (response: string, body?: string) => void;

type Request = {
	method: "GET" | "POST" | "PUT" | "PATCH";
	path: string;
	httpVersion: string;
	headers: { [key: string]: string };
	body: string | undefined;
	response: Response;
};

const _200 = "HTTP/1.1 200 OK\r\n";
// const _400 = "HTTP/1.1 400 Error\r\n";
const _404 = "HTTP/1.1 404 Not Found\r\n";

const textPlain = (content: string): string =>
	`Content-Type: text/plain\r\nContent-Length: ${content.length}\r\n\r\n${content}`;

const requestHandler: { [key: string]: (request: Request) => void } = {
	"/": ({ response }) => {
		response(_200);
	},
	"/index.html": ({ response }) => {
		response(_200);
	},
	"/echo/?.*": ({ path, response }) => {
		const endpoint = path.split("/")[2];
		if (endpoint) {
			response(_200, textPlain(endpoint));
		}
	},
	"/user-agent": ({ headers, response }) => {
		const userAgent = headers["User-Agent"];
		if (!userAgent) {
			response(_404);
			return;
		}
		response(_200, textPlain(userAgent));
	},
	"/files/.+": ({ method, path, body, response }) => {
		const directoryFlagIndex = process.argv.indexOf("--directory");
		const directory = process.argv[directoryFlagIndex + 1];
		console.log("directoryFlagIndex:", directoryFlagIndex);
		console.log("directory:", directory);
		const filename = path.split("/")[2];
		if (method === "GET") {
			try {
				if (filename) {
					const fileContent = readFileSync(
						`${directory}/${filename}`,
					).toString();
					response(
						_200,
						`Content - Type: application / octet - stream\r\nContent - Length: ${fileContent.length}\r\n\r\n${fileContent}`,
					);
				}
			} catch {
				response(_404);
			}
			return;
		}
		if (method === "POST") {
			try {
				if (filename && body) {
					writeFileSync(`${directory}/${filename}`, body);
					response(_200);
				} else {
					response(_404);
				}
			} catch {
				response(_404);
			}
			return;
		}
	},
} as const;

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
	const response: Response = (res: string, body = ""): void => {
		socket.write(res.concat(body, "\r\n"));
		socket.end();
	};
	socket.on("data", (data) => {
		const httpRequest = new TextDecoder().decode(data);
		const regex =
			/^(?<method>GET|POST|PUT|PATCH) (?<path>\S+) HTTP\/(?<httpVersion>\d\.\d)\r\n(?<headers>.*\r\n)\r\n$/gms.exec(
				httpRequest,
			)?.groups;
		if (!regex) {
			response(_404);
			return;
		}
		const { method, path, httpVersion, headers } = regex;
		const pathKey = Object.keys(requestHandler).find((handler) =>
			new RegExp(`^ ${handler}$`).test(path),
		);
		if (!pathKey) {
			response(_404);
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
			body: "",
			response,
		});
		response(_404);
	});
	socket.on("close", () => {
		socket.end();
	});
});

server.listen(4221, "localhost");
