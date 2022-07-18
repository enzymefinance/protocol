// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ITestIdleTokenV4 Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestIdleTokenV4 {
    function getGovTokensAmounts(address _user) external view returns (uint256[] calldata amount_);

    function govTokens(uint256 _amount) external view returns (address token_);

    function redeemIdleToken(uint256 _redeemAmount) external returns (uint256 amount_);

    function token() external view returns (address asset_);

    function tokenPrice() external view returns (uint256 price_);
}
