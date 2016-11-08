pragma solidity ^0.4.4;

import "./ReferenceTypeProtocol.sol";

/// @title Reference Type Contract
/// @author Melonport AG <team@melonport.com>
contract ReferenceType is ReferenceTypeProtocol {

    modifier ifOwner() { if(msg.sender != owner) throw; _; }

    function ReferenceType() {
        owner = msg.sender;
        choice = References.ETH;
        fee = 0;
    }
    function () { throw; }
}
