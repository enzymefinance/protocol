// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestYearnVaultV2 Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestYearnVaultV2 {
    function deposit(uint256 _depositAmount, address _recipient)
        external
        returns (uint256 amount_);

    function pricePerShare() external view returns (uint256 price_);

    function token() external view returns (address asset_);

    function withdraw(
        uint256 _maxShares,
        address _recipient,
        uint256 _maxLoss
    ) external returns (uint256 amount_);
}
