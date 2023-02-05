// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./IGlobalConfig1.sol";

/// @title IGlobalConfig2 Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @dev Each interface should inherit the previous interface,
/// e.g., `IGlobalConfig2 is IGlobalConfig1`
interface IGlobalConfig2 is IGlobalConfig1 {
    function formatDepositCall(
        address _vaultProxy,
        address _depositAsset,
        uint256 _depositAssetAmount
    ) external view returns (address target_, bytes memory payload_);

    function formatSingleAssetRedemptionCall(
        address _vaultProxy,
        address _recipient,
        address _asset,
        uint256 _amount,
        bool _amountIsShares
    ) external view returns (address target_, bytes memory payload_);
}
