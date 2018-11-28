pragma solidity ^0.4.21;

import "../../factory/Factory.sol";
import "../hub/Spoke.sol";
import "./Policy.sol";

// TODO: permissioning
contract PolicyManager is Spoke {
    struct Entry {
        Policy[] pre;
        Policy[] post;
    }

    mapping(bytes4 => Entry) policies;

    constructor(address _hub) Spoke(_hub) {}

    function registerBatch(bytes4[] sign, address[] ofPolicies) public {
        require(sign.length == ofPolicies.length, "Arrays lengths unequal");
        for (uint i = 0; i < sign.length; i++) {
            register(sign[i], ofPolicies[i]);
        }
    }

    function register(bytes4 sign, address ofPolicy) public {
        Policy.Applied position = Policy(ofPolicy).position();
        if (position == Policy.Applied.pre) {
            policies[sign].pre.push(Policy(ofPolicy));
        } else if (position == Policy.Applied.post) {
            policies[sign].post.push(Policy(ofPolicy));
        } else {
            revert("Only pre and post allowed");
        }
    }

    function PoliciesToAddresses(Policy[] storage _policies) internal view returns (address[]) {
        address[] memory res = new address[](_policies.length);
        for(uint i = 0; i < _policies.length; i++) {
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
        for(uint i = 0; i < aux.length; i++) {
            require(
                aux[i].rule(sig, addresses, values, identifier),
                "Rule evaluated to false"
            );
        }
    }
}

contract PolicyManagerFactory is Factory {
    function createInstance(address _hub) public returns (address) {
        address policyManager = new PolicyManager(_hub);
        childExists[policyManager] = true;
        return policyManager;
    }
}

