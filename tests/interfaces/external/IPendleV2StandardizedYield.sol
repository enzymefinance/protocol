// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2StandardizedYield Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2StandardizedYield {
    enum AssetType {
        TOKEN,
        LIQUIDITY
    }

    function deposit(address receiver, address tokenIn, uint256 amountTokenToDeposit, uint256 minSharesOut)
        external
        payable
        returns (uint256 amountSharesOut);

    function redeem(
        address receiver,
        uint256 amountSharesToRedeem,
        address tokenOut,
        uint256 minTokenOut,
        bool burnFromInternalBalance
    ) external returns (uint256 amountTokenOut);

    function exchangeRate() external view returns (uint256 res);

    function claimRewards(address user) external returns (uint256[] memory rewardAmounts);

    function accruedRewards(address user) external view returns (uint256[] memory rewardAmounts);

    function rewardIndexesCurrent() external returns (uint256[] memory indexes);

    function rewardIndexesStored() external view returns (uint256[] memory indexes);

    function getRewardTokens() external view returns (address[] memory);

    function yieldToken() external view returns (address);

    function getTokensIn() external view returns (address[] memory res);

    function getTokensOut() external view returns (address[] memory res);

    function isValidTokenIn(address token) external view returns (bool);

    function isValidTokenOut(address token) external view returns (bool);

    function previewDeposit(address tokenIn, uint256 amountTokenToDeposit)
        external
        view
        returns (uint256 amountSharesOut);

    function previewRedeem(address tokenOut, uint256 amountSharesToRedeem)
        external
        view
        returns (uint256 amountTokenOut);

    function assetInfo() external view returns (AssetType assetType, address assetAddress, uint8 assetDecimals);
}
