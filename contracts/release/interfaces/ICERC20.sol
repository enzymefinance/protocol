// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ICERC20 Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Minimal interface for interactions with Compound tokens (cTokens)
interface ICERC20 is IERC20 {
    function decimals() external view returns (uint8);

    function mint(uint256) external returns (uint256);

    function redeem(uint256) external returns (uint256);

    function exchangeRateStored() external view returns (uint256);

    function underlying() external returns (address);
}
