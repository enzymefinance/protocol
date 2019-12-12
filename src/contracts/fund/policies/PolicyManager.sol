pragma solidity ^0.5.13;

import "../../factory/Factory.sol";
import "../hub/Spoke.sol";
import "./Policy.sol";
import "./PolicyManager.i.sol";

contract PolicyManager is Spoke {

    event Registration(
        bytes4 indexed sig,
        Policy.Applied position,
        address indexed policy
    );

    struct Entry {
        Policy[] pre;
        Policy[] post;
    }

    mapping(bytes4 => Entry) policies;

    constructor (address _hub) public Spoke(_hub) {}

    function register(bytes4 sig, address _policy) public auth {
        Policy.Applied position = Policy(_policy).position();
        if (position == Policy.Applied.pre) {
            policies[sig].pre.push(Policy(_policy));
        } else if (position == Policy.Applied.post) {
            policies[sig].post.push(Policy(_policy));
        } else {
            revert("Only pre and post allowed");
        }
        emit Registration(sig, position, _policy);
    }

    function batchRegister(bytes4[] memory sig, address[] memory _policies) public auth {
        require(sig.length == _policies.length, "Arrays lengths unequal");
        for (uint i = 0; i < sig.length; i++) {
            register(sig[i], _policies[i]);
        }
    }

    function PoliciesToAddresses(Policy[] storage _policies) internal view returns (address[] memory) {
        address[] memory res = new address[](_policies.length);
        for(uint i = 0; i < _policies.length; i++) {
            res[i] = address(_policies[i]);
        }
        return res;
    }

    function getPoliciesBySig(bytes4 sig) public view returns (address[] memory, address[] memory) {
        return (PoliciesToAddresses(policies[sig].pre), PoliciesToAddresses(policies[sig].post));
    }

    modifier isValidPolicyBySig(bytes4 sig, address[5] memory addresses, uint[3] memory values, bytes32 identifier) {
        preValidate(sig, addresses, values, identifier);
        _;
        postValidate(sig, addresses, values, identifier);
    }

    modifier isValidPolicy(address[5] memory addresses, uint[3] memory values, bytes32 identifier) {
        preValidate(msg.sig, addresses, values, identifier);
        _;
        postValidate(msg.sig, addresses, values, identifier);
    }

    function preValidate(bytes4 sig, address[5] memory addresses, uint[3] memory values, bytes32 identifier) view public {
        validate(policies[sig].pre, sig, addresses, values, identifier);
    }

    function postValidate(bytes4 sig, address[5] memory addresses, uint[3] memory values, bytes32 identifier) view public {
        validate(policies[sig].post, sig, addresses, values, identifier);
    }

    function validate(Policy[] storage aux, bytes4 sig, address[5] memory addresses, uint[3] memory values, bytes32 identifier) view internal {
        for(uint i = 0; i < aux.length; i++) {
            require(
                aux[i].rule(sig, addresses, values, identifier),
                "Rule evaluated to false"
            );
        }
    }
}

contract PolicyManagerFactory is PolicyManagerFactoryInterface, Factory {
    function createInstance(address _hub) external returns (address) {
        address policyManager = address(new PolicyManager(_hub));
        childExists[policyManager] = true;
        emit NewInstance(_hub, policyManager);
        return policyManager;
    }
}

