import Table from "cli-table3";

export function table(head: string[], rows: string[][]): string {
  const t = new Table({ head });
  rows.forEach((row) => t.push(row));
  return t.toString();
}
