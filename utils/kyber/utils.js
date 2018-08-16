function toHexString(byteArray) {
  /* eslint no-bitwise: ["error", { "allow": ["&"] }] */
  return Array.from(byteArray, (byte) => (`0${  (byte & 0xff).toString(16)}`).slice(-2)).join("");
}

function bytesToHex(byteArray) {
  const strNum = toHexString(byteArray);
  const num = `0x${  strNum}`;
  return num;
}

function splitArray(arr, length) {
  const groups = arr
    .map((e, i) => i % length === 0 ? arr.slice(i, i + length) : null)
    .filter((e) => e);
  return groups;
}

export { bytesToHex, splitArray };
