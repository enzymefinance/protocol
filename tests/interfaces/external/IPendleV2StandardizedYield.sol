// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2StandardizedYield Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IPendleV2StandardizedYield {
    function accruedRewards(address _user) external view returns (uint256[] memory rewardAmounts_);

    function getRewardTokens() external view returns (address[] memory rewardTokens_);

    function yieldToken() external view returns (address yieldToken_);

    function isValidTokenIn(address _token) external view returns (bool isValid_);

    function isValidTokenOut(address _token) external view returns (bool isValid_);

    function previewDeposit(address _tokenIn, uint256 _amountTokenToDeposit)
        external
        view
        returns (uint256 amountSharesOut_);

    function previewRedeem(address _tokenOut, uint256 _amountSharesToRedeem)
        external
        view
        returns (uint256 amountTokenOut_);
}
