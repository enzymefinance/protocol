pragma solidity ^0.4.21;

import "./Policy.sol";
import "../hub/Spoke.sol";
import "../../factory/Factory.i.sol";

// TODO: permissioning
contract PolicyManager is Spoke {
    struct Entry {
        Policy[] pre;
        Policy[] post;
    }

    mapping(bytes4 => Entry) policies;

    constructor(address _hub) Spoke(_hub) {}

    function registerBatch(bytes4[] sign, address[] ofPolicies) public {
        require(sign.length == ofPolicies.length);
        for (uint i = 0; i < sign.length; ++i) {
            register(sign[i], ofPolicies[i]);
        }
    }
    
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
    
    modifier isValidPolicyBySig(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) {
        preValidate(sig, addresses, values, identifier);
        _;
        postValidate(sig, addresses, values, identifier);
    }

    modifier isValidPolicy(address[5] addresses, uint[3] values, bytes32 identifier) {
        preValidate(msg.sig, addresses, values, identifier);
        _;
        postValidate(msg.sig, addresses, values, identifier);
    }
    
    function preValidate(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) view public {
        validate(policies[sig].pre, sig, addresses, values, identifier);
    }

    function postValidate(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) view public {
        validate(policies[sig].post, sig, addresses, values, identifier);
    }

    function validate(Policy[] storage aux, bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) view internal {
        for(uint i = 0; i < aux.length; ++i) {
            if (aux[i].rule(sig, addresses, values, identifier) == false) {
                revert();
            }
        }
    }
}

contract PolicyManagerFactory is FactoryInterface {
    function createInstance(address _hub) public returns (address) {
        return new PolicyManager(_hub);
    }
}

