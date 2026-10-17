import consola from "consola";
import pc from "picocolors";

export const colors = pc;

export const log = {
	info: (msg: string) => consola.info(msg),
	success: (msg: string) => consola.success(msg),
	warn: (msg: string) => consola.warn(msg),
	error: (msg: string) => consola.error(msg),
	debug: (msg: string) => consola.debug(msg),
};
