import api from "./api";

// convenience functions

// input manager's address
export default async function getSignatureParameters(managerAddress) {
  const hash = "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  // const hash = "0x255f369de4474bc1fe41e3f0a5eaf56f276c6ecad45b4115a5b033cf9a11eeb6";
  let sig = await api.eth.sign(managerAddress, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;
  return [r, s, v];
}
