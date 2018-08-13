function toHexString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('')
}

function bytesToHex(byteArray) {
    const strNum = toHexString(byteArray);
    const num = '0x' + strNum;
    return num;
}

function splitArray(arr, length) {
    const groups = arr.map( function(e,i){
        return i%length===0 ? arr.slice(i,i+length) : null;
    })
    .filter(function(e){ return e; });
    return groups;
}

export {bytesToHex, splitArray};
