// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

/// @title ITermFinanceV1RepoCollateralManager Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITermFinanceV1RepoCollateralManager {
    function encumberedCollateralRemaining() external view returns (bool encumberedCollateralRemaining_);

    function unlockCollateralOnRepurchase(address _borrower) external;
}
