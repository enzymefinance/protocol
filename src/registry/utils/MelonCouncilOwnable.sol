// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../node_modules/@openzeppelin/contracts/access/Ownable.sol";

/// @title MelonCouncilOwnable Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A base contract for ownership of Melon's top-level contract,
/// which ensures Melon Council control after setup
contract MelonCouncilOwnable is Ownable {
    address immutable public MGM;
    address immutable public MTC;

    constructor(address _MTC, address _MGM) public {
        MTC = _MTC;
        MGM = _MGM;
    }

    /// @notice Renounces ownership of the contract (NOT ALLOWED)
    /// @dev Ownership cannot be destroyed
    function renounceOwnership() public override {
        revert("renounceOwnership: Renouncing ownership not allowed");
    }

    /// @notice Transfers ownership of the contract
    /// @param _newOwner The new contract owner
    /// @dev Ownership is only transferrable until the MTC receives ownership.
    /// After that, ownership is no longer transferrable. This is desirable so
    /// that Melon developers can do the time-consuming work of deploying and
    /// configuring a contract, before giving custody of it to the Melon Council
    function transferOwnership(address _newOwner) public override onlyOwner {
        require(MTC != owner(), "transferOwnership: MTC cannot transfer ownership");
        super.transferOwnership(_newOwner);
    }
}
