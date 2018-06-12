pragma solidity ^0.4.21;

import "./Policy.sol";

contract PolicyManager {
    mapping(bytes4 => Policy[]) policies;

    function register(bytes4 sign, address ofPolicy) public {
        policies[sign].push(Policy(ofPolicy));  // can use keckkak256
    }

    modifier isValidPolicyBySig(bytes4 sig, address[4] addresses, uint[2] values) {
        require(validatePolicy(sig, addresses, values) == true);
        _;
    }

    modifier isValidPolicy(address[4] addresses, uint[2] values) {
        require(validatePolicy(msg.sig, addresses, values) == true);
        _;
    }

    function validatePolicy(bytes4 sig, address[4] addresses, uint[2] values) view internal returns (bool) {
        Policy[] memory aux = policies[sig];
        for(uint i = 0; i < aux.length; ++i) {  // delegatecall
            if (aux[i].rule(addresses, values) == false) {
                return false;
            }
        }
        return true;
    }
}
