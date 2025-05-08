    // SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IStakeWiseV3KeeperRewards Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IStakeWiseV3KeeperRewards {
    struct RewardsUpdateParams {
        bytes32 rewardsRoot;
        uint256 avgRewardPerSecond;
        uint64 updateTimestamp;
        string rewardsIpfsHash;
        bytes signatures;
    }

    function addOracle(address _oracle) external;

    function owner() external view returns (address owner_);

    function removeOracle(address _oracle) external;

    function rewardsDelay() external returns (uint256 rewardsDelay_);

    function rewardsMinOracles() external view returns (uint256 minOracles_);

    function rewardsNonce() external view returns (uint256 rewardsNonce_);

    function rewardsRoot() external returns (bytes32 rewardsRoot_);

    function setRewardsMinOracles(uint256 _rewardsMinOracles) external;

    function setValidatorsMinOracles(uint256 _validatorsMinOracles) external;

    function updateRewards(RewardsUpdateParams calldata _params) external;

    function validatorsMinOracles() external view returns (uint256 minOracles_);
}
