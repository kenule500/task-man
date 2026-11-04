// Shared slug helpers.
//
// The trims below used to be `/^-+|-+$/g`-style patterns. On a long run of the trimmed character
// the regex engine backtracks quadratically, and these functions take user-supplied names, so the
// walk over the ends of the string is done by hand instead (CodeQL js/polynomial-redos).

/** Removes every leading and trailing copy of `char`; linear in the length of `value`. */
export const trimChar = (value: string, char: string): string => {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === char) start += 1;
  while (end > start && value[end - 1] === char) end -= 1;
  return value.slice(start, end);
};
