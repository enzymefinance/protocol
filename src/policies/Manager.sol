pragma solidity ^0.4.21;

import "./Policy.sol";

contract PolicyManager {
    struct Entry {
        Policy[] pre;
        Policy[] post;
    }

    mapping(bytes4 => Entry) policies;

    function register(bytes4 sign, address ofPolicy) public {
        uint position = Policy(ofPolicy).position();
        if (position == 0) {
            // Pre condition
            policies[sign].pre.push(Policy(ofPolicy));
        } else if (position == 1) {
            // Post condition
            policies[sign].post.push(Policy(ofPolicy));
        } else {
            revert();    // Only 0 or 1 allowed
        }
    }

    function PoliciesToAddresses(Policy[] storage _policies) internal view returns (address[]) {
        address[] memory res = new address[](_policies.length);
        for(uint i = 0; i < _policies.length; ++i) {
            res[i] = address(_policies[i]);
        }
        return res;
    }

    function getPoliciesBySig(bytes4 sig) public view returns (address[], address[]) {
        return (PoliciesToAddresses(policies[sig].pre), PoliciesToAddresses(policies[sig].post));
    }
    
    modifier isValidPolicyBySig(bytes4 sig, address[4] addresses, uint[2] values) {
        preValidate(sig, addresses, values);
        _;
        postValidate(sig, addresses, values);
    }

    modifier isValidPolicy(address[4] addresses, uint[2] values) {
        preValidate(msg.sig, addresses, values);
        _;
        postValidate(msg.sig, addresses, values);
    }
    
    function preValidate(bytes4 sig, address[4] addresses, uint[2] values) view public {
        validate(policies[sig].pre, addresses, values);
    }

    function postValidate(bytes4 sig, address[4] addresses, uint[2] values) view public {
        validate(policies[sig].post, addresses, values);
    }

    function validate(Policy[] storage aux, address[4] addresses, uint[2] values) view internal {
        for(uint i = 0; i < aux.length; ++i) {
            if (aux[i].rule(addresses, values) == false) {
                revert();
            }
        }
    }
}
