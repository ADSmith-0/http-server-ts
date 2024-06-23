import fs from "node:fs";
import * as net from "node:net";
import process from "node:process";
import { gunzip, gunzipSync, gzipSync } from "node:zlib";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

type Response = (
	response: 200 | 201 | 404 | 405 | 500,
	headers?: { [key: string]: string },
	body?: string,
) => void;

type Request = {
	method: "GET" | "POST" | "PUT" | "PATCH";
	path: string;
	httpVersion: string;
	headers: { [key: string]: string };
	body: string | undefined;
	response: Response;
};

type Callback = (request: Request) => void;
type Methods = Partial<Record<Request["method"], Callback>>;

const isCallback = (value: Callback | Methods): value is Callback =>
	typeof value === "function";

const requestHandler: {
	[key: string]: Callback | Methods;
} = {
	"/": ({ response }) => {
		response(200);
	},
	"/index.html": ({ response }) => {
		response(200);
	},
	"/echo/.+": ({ path, headers, response }) => {
		const endpoint = path.split("/")[2];
		const responseHeaders = /\bgzip\b/.test(headers["Accept-Encoding"])
			? { "Content-Encoding": "gzip" }
			: undefined;

		if (endpoint) {
			response(200, responseHeaders, endpoint);
		}
	},
	"/user-agent": ({ headers, response }) => {
		const userAgent = headers["User-Agent"];
		if (!userAgent) {
			response(404);
			return;
		}
		response(200, undefined, userAgent);
	},
	"/files/.+": {
		GET: ({ path, response }) => {
			const directoryFlagIndex = process.argv.indexOf("--directory");
			const directory = process.argv[directoryFlagIndex + 1];
			const filename = path.split("/")[2];
			if (!filename) {
				response(404);
				return;
			}
			const filePath = directory + filename;
			try {
				const fileContent = fs.readFileSync(filePath).toString();
				response(
					200,
					{
						"Content-Type": "application/octet-stream",
					},
					fileContent,
				);
			} catch {
				response(404);
			}
		},
		POST: ({ path, body, response }) => {
			const directoryFlagIndex = process.argv.indexOf("--directory");
			const directory = process.argv[directoryFlagIndex + 1];
			const filename = path.split("/")[2];
			if (!filename) {
				response(404);
				return;
			}
			const filePath = directory + filename;
			try {
				if (body) {
					fs.writeFileSync(filePath, body);
					response(201);
				} else {
					response(404);
				}
			} catch {
				response(500);
			}
		},
	},
} as const;

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
	const response: Response = (res, headers = {}, body = undefined): void => {
		const message: Record<typeof res, string> = {
			200: "OK",
			201: "Created",
			404: "Not Found",
			405: "Method Not Allowed",
			500: "Internal Server Error",
		};

		const responseHeaders: Record<string, string> = {};
		let responseHeader = "";
		let gzippedBody: Buffer | undefined = undefined;

		if (body) {
			if (headers && /\bgzip\b/.test(headers["Content-Encoding"]) && body) {
				gzippedBody = gzipSync(Buffer.from(body, "utf-8"));
			}
			responseHeaders["Content-Type"] = "text/plain";
			responseHeaders["Content-Length"] = (
				gzippedBody?.length ?? body.length
			).toString();
		}

		if (
			Object.keys(headers).length > 0 ||
			Object.keys(responseHeaders).length > 0
		) {
			responseHeader = Object.entries({
				...responseHeaders,
				...headers,
			}).reduce((acc, [key, value]) => acc.concat(`${key}: ${value}\r\n`), "");
		}

		if (gzippedBody) {
			socket.write(
				`HTTP/1.1 ${res} ${message[res]}\r\n`.concat(responseHeader, "\r\n"),
			);
			socket.write(gzippedBody);
		} else {
			socket.write(
				`HTTP/1.1 ${res} ${message[res]}\r\n`.concat(
					responseHeader,
					"\r\n",
					body ?? "",
				),
			);
		}
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
		const requestObj = {
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
		};

		const endpoint = requestHandler[pathKey];

		if (isCallback(endpoint)) {
			if (method !== "GET") {
				response(405);
				return;
			}
			endpoint(requestObj);
		} else {
			const methodEndpoint = endpoint[method as keyof Methods];
			if (methodEndpoint === undefined) {
				response(405);
				return;
			}
			methodEndpoint(requestObj);
		}
		response(404);
	});
	socket.on("close", () => {
		socket.end();
	});
});

server.listen(4221, "localhost");
