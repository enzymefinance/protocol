// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2PrincipalToken Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2PrincipalToken {
    function expiry() external view returns (uint256 expiry_);
}
