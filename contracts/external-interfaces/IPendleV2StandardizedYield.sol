// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2StandardizedYield Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2StandardizedYield {
    enum AssetType {
        TOKEN,
        LIQUIDITY
    }

    function assetInfo() external view returns (AssetType assetType_, address assetAddress_, uint8 assetDecimals_);

    function deposit(address _receiver, address _tokenIn, uint256 _amountTokenToDeposit, uint256 _minSharesOut)
        external
        payable
        returns (uint256 amountSharesOut_);

    function redeem(
        address _receiver,
        uint256 _amountSharesToRedeem,
        address _tokenOut,
        uint256 _minTokenOut,
        bool _burnFromInternalBalance
    ) external returns (uint256 amountTokenOut_);
}
