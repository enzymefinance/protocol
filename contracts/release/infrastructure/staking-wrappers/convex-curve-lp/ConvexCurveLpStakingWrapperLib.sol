// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../external-interfaces/IConvexBaseRewardPool.sol";
import "../../../../external-interfaces/IConvexBooster.sol";
import "../../../../external-interfaces/IConvexVirtualBalanceRewardPool.sol";
import "../StakingWrapperLibBase.sol";

/// @title ConvexCurveLpStakingWrapperLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A library contract for ConvexCurveLpStakingWrapper instances
contract ConvexCurveLpStakingWrapperLib is StakingWrapperLibBase {
    IConvexBooster private immutable CONVEX_BOOSTER_CONTRACT;
    address private immutable CRV_TOKEN;
    address private immutable CVX_TOKEN;

    address private convexPool;
    uint256 private convexPoolId;
    address private curveLPToken;

    constructor(
        address _owner,
        address _convexBooster,
        address _crvToken,
        address _cvxToken
    ) public StakingWrapperBase(_owner, "", "") {
        CONVEX_BOOSTER_CONTRACT = IConvexBooster(_convexBooster);
        CRV_TOKEN = _crvToken;
        CVX_TOKEN = _cvxToken;
    }

    /// @notice Initializes the proxy
    /// @param _pid The Convex pool id for which to use the proxy
    function init(uint256 _pid) external {
        // Can validate with any variable set here
        require(getCurveLpToken() == address(0), "init: Initialized");

        IConvexBooster.PoolInfo memory poolInfo = CONVEX_BOOSTER_CONTRACT.poolInfo(_pid);

        // Set ERC20 info on proxy
        __setTokenName(string(abi.encodePacked("Enzyme Staked: ", ERC20(poolInfo.token).name())));
        __setTokenSymbol(string(abi.encodePacked("stk", ERC20(poolInfo.token).symbol())));

        curveLPToken = poolInfo.lptoken;
        convexPool = poolInfo.crvRewards;
        convexPoolId = _pid;

        __addRewardToken(CRV_TOKEN);
        __addRewardToken(CVX_TOKEN);
        addExtraRewards();

        setApprovals();
    }

    /// @notice Adds rewards tokens that have not yet been added to the wrapper
    /// @dev Anybody can call, in case more pool tokens are added.
    /// Is called prior to every new harvest.
    function addExtraRewards() public {
        IConvexBaseRewardPool convexPoolContract = IConvexBaseRewardPool(getConvexPool());
        // Could probably exit early after validating that extraRewardsCount + 2 <= rewardsTokens.length,
        // but this protects against a reward token being removed that still needs to be paid out
        uint256 extraRewardsCount = convexPoolContract.extraRewardsLength();
        for (uint256 i; i < extraRewardsCount; i++) {
            // __addRewardToken silently ignores duplicates
            __addRewardToken(
                IConvexVirtualBalanceRewardPool(convexPoolContract.extraRewards(i)).rewardToken()
            );
        }
    }

    /// @notice Sets necessary ERC20 approvals, as-needed
    function setApprovals() public {
        ERC20(getCurveLpToken()).safeApprove(address(CONVEX_BOOSTER_CONTRACT), type(uint256).max);
    }

    ////////////////////////////////
    // STAKING WRAPPER BASE LOGIC //
    ////////////////////////////////

    /// @dev Logic to be run during a deposit, specific to the integrated protocol.
    /// Do not mint staking tokens, which already happens during __deposit().
    function __depositLogic(address _from, uint256 _amount) internal override {
        ERC20(getCurveLpToken()).safeTransferFrom(_from, address(this), _amount);
        CONVEX_BOOSTER_CONTRACT.deposit(convexPoolId, _amount, true);
    }

    /// @dev Logic to be run during a checkpoint to harvest new rewards, specific to the integrated protocol.
    /// Can also be used to add new rewards tokens dynamically.
    /// Do not checkpoint, only harvest the rewards.
    function __harvestRewardsLogic() internal override {
        // It's probably overly-cautious to check rewards on every call,
        // but even when the pool has 1 extra reward token (most have 0) it only adds ~10-15k gas units,
        // so more convenient to always check than to monitor for rewards changes.
        addExtraRewards();
        IConvexBaseRewardPool(getConvexPool()).getReward();
    }

    /// @dev Logic to be run during a withdrawal, specific to the integrated protocol.
    /// Do not burn staking tokens, which already happens during __withdraw().
    function __withdrawLogic(address _to, uint256 _amount) internal override {
        IConvexBaseRewardPool(getConvexPool()).withdrawAndUnwrap(_amount, false);
        ERC20(getCurveLpToken()).safeTransfer(_to, _amount);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the associated Convex reward pool address
    /// @return convexPool_ The reward pool
    function getConvexPool() public view returns (address convexPool_) {
        return convexPool;
    }

    /// @notice Gets the associated Convex reward pool id (pid)
    /// @return convexPoolId_ The pid
    function getConvexPoolId() public view returns (uint256 convexPoolId_) {
        return convexPoolId;
    }

    /// @notice Gets the associated Curve LP token
    /// @return curveLPToken_ The Curve LP token
    function getCurveLpToken() public view returns (address curveLPToken_) {
        return curveLPToken;
    }
}
