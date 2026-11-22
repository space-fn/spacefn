import { format, stripVTControlCharacters } from "node:util";

import { afterAll, beforeAll, beforeEach, vi } from "vitest";

/**
 * Keeps the log lines a test file expects out of its output and returns them, emptied
 * before each test, to assert on. Any other line still prints, so a surprise stays visible.
 */
export const captureLogs = (...expected: readonly RegExp[]): readonly string[] => {
	const captured: string[] = [];
	const restore: (() => void)[] = [];
	beforeAll(() => {
		for (const method of ["log", "info", "warn", "error"] as const) {
			const print = console[method].bind(console);
			const spy = vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
				const line = stripVTControlCharacters(format(...args));
				if (expected.some((pattern) => pattern.test(line))) captured.push(line);
				else print(...args);
			});
			restore.push(() => spy.mockRestore());
		}
	});
	beforeEach(() => {
		captured.length = 0;
	});
	afterAll(() => {
		for (const undo of restore) undo();
	});
	return captured;
};

/** The line `HttpMiddleware.logger` writes for each request. */
export const REQUEST_LOG = /INFO .*Sent HTTP response/;
