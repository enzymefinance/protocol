import api from "./api";

// convenience functions

// input manager's address
export default async function getSignatureParameters(managerAddress) {
  const hash = "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(managerAddress, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseInt(sig.substr(128, 2), 16);
  return [r, s, v];
}
