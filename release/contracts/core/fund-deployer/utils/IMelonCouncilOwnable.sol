// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IMelonCouncilOwnable Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IMelonCouncilOwnable {
    function getOwner() external view returns (address);
}
