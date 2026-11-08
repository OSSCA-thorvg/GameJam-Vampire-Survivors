/** Ends every exhaustive `switch` on a message `type` or `kind`: a missing case is a type error, and throws at run time. */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}
