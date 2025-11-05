import { describe, expect, it, vi } from "vitest";
import type { Runtime } from "../src/runtime";
import { createServerProxy } from "../src/server-proxy";

function createMockRuntime() {
	return {
		callTool: vi.fn(async (_, __, options) => options),
		listTools: vi.fn(async () => []),
	};
}

describe("createServerProxy", () => {
	it("maps camelCase property names to kebab-case tool names", async () => {
		const runtime = createMockRuntime();
		const context7 = createServerProxy(
			runtime as unknown as Runtime,
			"context7",
		) as Record<string, unknown>;

		const resolver = context7.resolveLibraryId as (
			args: unknown,
		) => Promise<unknown>;
		await resolver({ libraryName: "react" });

		expect(runtime.callTool).toHaveBeenCalledWith(
			"context7",
			"resolve-library-id",
			{ args: { libraryName: "react" } },
		);
	});

	it("merges args and options when both are provided", async () => {
		const runtime = createMockRuntime();
		const proxy = createServerProxy(
			runtime as unknown as Runtime,
			"foo",
		) as Record<string, unknown>;

		const fn = proxy.someTool as (
			args: unknown,
			options: unknown,
		) => Promise<unknown>;
		await fn({ foo: "bar" }, { tailLog: true });

		expect(runtime.callTool).toHaveBeenCalledWith("foo", "some-tool", {
			args: { foo: "bar" },
			tailLog: true,
		});
	});

	it("supports passing full call options as the first argument", async () => {
		const runtime = createMockRuntime();
		const proxy = createServerProxy(
			runtime as unknown as Runtime,
			"bar",
		) as Record<string, unknown>;

		const fn = proxy.otherTool as (options: unknown) => Promise<unknown>;
		await fn({ args: { value: 1 }, tailLog: true });

		expect(runtime.callTool).toHaveBeenCalledWith("bar", "other-tool", {
			args: { value: 1 },
			tailLog: true,
		});
	});
});
