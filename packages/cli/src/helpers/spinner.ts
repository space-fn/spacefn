import ora from "ora";

export function spinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
  const s = ora(text).start();
  return fn().then(
    (result) => {
      s.succeed();
      return result;
    },
    (err) => {
      s.fail();
      throw err;
    },
  );
}
