const randomString = (length = 4) =>
  Math.random()
    .toString(36)
    .substr(2, length);

export { randomString };
