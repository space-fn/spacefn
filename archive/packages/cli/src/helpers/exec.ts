import { execa } from "execa";

export interface ExecOptions {
	cwd?: string;
	silent?: boolean;
}

export async function exec(
	command: string,
	args?: string[],
	options?: ExecOptions,
): Promise<string> {
	const result = await execa(command, args ?? [], {
		cwd: options?.cwd ?? process.cwd(),
		stdio: options?.silent ? "pipe" : "inherit",
	});
	return result.stdout ?? "";
}
