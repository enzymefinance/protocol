// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

interface IConvexBooster {
    struct PoolInfo {
        address lptoken;
        address token;
        address gauge;
        address crvRewards;
        address stash;
        bool shutdown;
    }

    function poolInfo(uint256 _pid) external view returns (PoolInfo memory poolInfo_);
}
