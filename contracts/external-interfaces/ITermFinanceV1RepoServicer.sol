// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ITermFinanceV1RepoServicer Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITermFinanceV1RepoServicer {
    function redeemTermRepoTokens(address _redeemer, uint256 _amountToRedeem) external;

    function redemptionTimestamp() external view returns (uint256 redemptionTimestamp_);

    function shortfallHaircutMantissa() external view returns (uint256 shortfallHaircutMantissa_);

    function termRepoCollateralManager() external view returns (address termRepoCollateralManager_);

    function termRepoLocker() external view returns (address repoLocker_);

    function termRepoToken() external view returns (address repoToken_);

    function totalOutstandingRepurchaseExposure() external view returns (uint256 outstandingRepurchaseExposure_);

    function totalRepurchaseCollected() external view returns (uint256 repurchaseCollected_);
}
