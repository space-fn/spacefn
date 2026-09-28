export interface Generator {
	watch: string | string[];
	output: string;
	generate(files: string[]): string | Promise<string>;
}
