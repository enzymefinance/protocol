pragma solidity ^0.4.18;

contract Factory {
    function make(bytes code) internal returns (address result) {
        uint size;

        assembly {
            result := create(0, add(code, 0x20), mload(code))
            size := extcodesize(result)
        }

        require(size > 0);
    }
}
