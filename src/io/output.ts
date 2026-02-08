export const log = (message: string) => {
  process.stderr.write(`${message}\n`);
};

export const print = (message: string) => {
  process.stdout.write(`${message}\n`);
};

export const printJson = (value: unknown) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};
