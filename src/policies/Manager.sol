pragma solidity ^0.4.21;

import "./Policy.sol";

contract PolicyManager {
    mapping(bytes4 => Policy[]) policies;

    function register(bytes4 sign, address ofPolicy) public {
        policies[sign].push(Policy(ofPolicy));  // can use keckkak256
    }

    modifier validPolicy {
        require(isValidPolicy() == true);
        _;
    }

    function isValidPolicy() view internal returns (bool) {
        Policy[] memory aux = policies[msg.sig];
        for(uint i = 0; i < aux.length; ++i) {  // delegatecall
            if (aux[i].rule() == false) {
                return false;
            }
        }
        return true;
    }
}
