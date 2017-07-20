pragma solidity ^0.4.11;

contract b64 {
    function b64decode(bytes s) internal returns (bytes) {
        byte v1;
        byte v2;
        byte v3;
        byte v4;

        //bytes memory s = bytes(_s);
        uint length = s.length;
        bytes memory result = new bytes(length);

        uint index;

        bytes memory BASE64_DECODE_CHAR = hex"000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e003e003f3435363738393a3b3c3d00000000000000000102030405060708090a0b0c0d0e0f10111213141516171819000000003f001a1b1c1d1e1f202122232425262728292a2b2c2d2e2f30313233";
        //MAP[chr]
        if (sha3(s[length - 2]) == sha3('=')) {
            length -= 2;
        } else if (sha3(s[length - 1]) == sha3('=')) {
            length -= 1;
        }

        uint count = length >> 2 << 2;

        for (uint i = 0; i < count;) {
            v1 = BASE64_DECODE_CHAR[uint(s[i++])];
            v2 = BASE64_DECODE_CHAR[uint(s[i++])];
            v3 = BASE64_DECODE_CHAR[uint(s[i++])];
            v4 = BASE64_DECODE_CHAR[uint(s[i++])];


            result[index++] = (v1 << 2 | v2 >> 4) & 255;
            result[index++] = (v2 << 4 | v3 >> 2) & 255;
            result[index++] = (v3 << 6 | v4) & 255;
        }

       if (length - count == 2) {
            v1 = BASE64_DECODE_CHAR[uint(s[i++])];
            v2 = BASE64_DECODE_CHAR[uint(s[i++])];
            result[index++] = (v1 << 2 | v2 >> 4) & 255;
        }
        else if (length - count == 3) {
            v1 = BASE64_DECODE_CHAR[uint(s[i++])];
            v2 = BASE64_DECODE_CHAR[uint(s[i++])];
            v3 = BASE64_DECODE_CHAR[uint(s[i++])];

            result[index++] = (v1 << 2 | v2 >> 4) & 255;
            result[index++] = (v2 << 4 | v3 >> 2) & 255;
        }

        // set to correct length
        assembly {
            mstore(result, index)
        }

        //debug(result);
        //res = result;
        return result;
    }
}
