import type {
	CallOptions,
	ListToolsOptions,
	Runtime,
	ServerToolInfo,
} from "./runtime.js";

function defaultToolNameMapper(propertyKey: string | symbol): string {
	if (typeof propertyKey !== "string") {
		throw new TypeError("Tool name must be a string when using server proxy.");
	}
	return propertyKey
		.replace(/_/g, "-")
		.replace(/([a-z\d])([A-Z])/g, "$1-$2")
		.toLowerCase();
}

type ToolCallOptions = CallOptions & { args?: unknown };

type ServerProxy = {
	call(toolName: string, options?: ToolCallOptions): Promise<unknown>;
	listTools(options?: ListToolsOptions): Promise<ServerToolInfo[]>;
};

export function createServerProxy(
	runtime: Runtime,
	serverName: string,
	mapPropertyToTool: (
		property: string | symbol,
	) => string = defaultToolNameMapper,
): ServerProxy {
	const base: ServerProxy = {
		call: (toolName: string, options?: ToolCallOptions) =>
			runtime.callTool(serverName, toolName, options ?? {}),
		listTools: (options) => runtime.listTools(serverName, options),
	};

	return new Proxy(base as ServerProxy & Record<string | symbol, unknown>, {
		get(target, property, receiver) {
			if (Reflect.has(target, property)) {
				return Reflect.get(target, property, receiver);
			}

			const toolName = mapPropertyToTool(property);

			return async (...callArgs: unknown[]) => {
				const [firstArg, secondArg] = callArgs;
				const finalOptions: ToolCallOptions = {};

				if (typeof secondArg === "object" && secondArg !== null) {
					Object.assign(finalOptions, secondArg as ToolCallOptions);
				}

				if (firstArg !== undefined) {
					if (
						typeof firstArg === "object" &&
						firstArg !== null &&
						"args" in (firstArg as Record<string, unknown>) &&
						secondArg === undefined
					) {
						Object.assign(finalOptions, firstArg as ToolCallOptions);
					} else {
						finalOptions.args = firstArg as ToolCallOptions["args"];
					}
				}

				return runtime.callTool(serverName, toolName, finalOptions);
			};
		},
	});
}
