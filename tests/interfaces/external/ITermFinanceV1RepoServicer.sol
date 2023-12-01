// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface ITermFinanceV1RepoServicer {
    function redemptionTimestamp() external view returns (uint256 redemptionTimestamp_);

    function submitRepurchasePayment(uint256 _amount) external;

    function termRepoCollateralManager() external view returns (address termRepoCollateralManager_);

    function termRepoLocker() external view returns (address repoLocker_);

    function termRepoToken() external view returns (address repoToken_);
}
