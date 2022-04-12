// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../interfaces/IMaplePool.sol";
import "../../../../interfaces/IMaplePoolFactory.sol";
import "../../../../interfaces/IMapleMplRewardsFactory.sol";
import "../IExternalPositionParser.sol";
import "./IMapleLiquidityPosition.sol";
import "./MapleLiquidityPositionDataDecoder.sol";

pragma solidity 0.6.12;

/// @title MapleLiquidityPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Maple Debt Positions
contract MapleLiquidityPositionParser is
    MapleLiquidityPositionDataDecoder,
    IExternalPositionParser
{
    address private immutable MAPLE_POOL_FACTORY;
    address private immutable MAPLE_MPL_REWARDS_FACTORY;

    constructor(address _maplePoolFactory, address _mapleMplRewardsFactory) public {
        MAPLE_POOL_FACTORY = _maplePoolFactory;
        MAPLE_MPL_REWARDS_FACTORY = _mapleMplRewardsFactory;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(
        address,
        uint256 _actionId,
        bytes memory _encodedActionArgs
    )
        external
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        __validateActionData(_actionId, _encodedActionArgs);

        if (_actionId == uint256(IMapleLiquidityPosition.Actions.Lend)) {
            (address asset, , uint256 amount) = __decodeLendActionArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);

            assetsToTransfer_[0] = asset;
            amountsToTransfer_[0] = amount;
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.Redeem)) {
            (address asset, , ) = __decodeRedeemActionArgs(_encodedActionArgs);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = asset;
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.ClaimInterest)) {
            address pool = __decodeClaimInterestActionArgs(_encodedActionArgs);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = IMaplePool(pool).liquidityAsset();
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @return initArgs_ Parsed and encoded args for ExternalPositionProxy.init()
    function parseInitArgs(address, bytes memory)
        external
        override
        returns (bytes memory initArgs_)
    {
        return "";
    }

    // PRIVATE FUNCTIONS

    /// @dev Runs validations before running a callOnExternalPosition.
    function __validateActionData(uint256 _actionId, bytes memory _actionArgs) private view {
        if (_actionId == uint256(IMapleLiquidityPosition.Actions.Lend)) {
            (, address pool, ) = __decodeLendActionArgs(_actionArgs);

            __validatePool(pool);
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.IntendToRedeem)) {
            address pool = __decodeIntendToRedeemActionArgs(_actionArgs);

            __validatePool(pool);
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.Redeem)) {
            (, address pool, ) = __decodeRedeemActionArgs(_actionArgs);

            __validatePool(pool);
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.Stake)) {
            (address rewardsContract, address pool, ) = __decodeStakeActionArgs(_actionArgs);

            __validatePool(pool);
            __validateRewardsContract(rewardsContract);
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.Unstake)) {
            (address rewardsContract, ) = __decodeUnstakeActionArgs(_actionArgs);

            __validateRewardsContract(rewardsContract);
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.ClaimInterest)) {
            address pool = __decodeClaimInterestActionArgs(_actionArgs);

            __validatePool(pool);
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.ClaimRewards)) {
            address rewardsContract = __decodeClaimRewardsActionArgs(_actionArgs);

            __validateRewardsContract(rewardsContract);
        }
    }

    // Validates that a pool has been deployed from the Maple pool factory
    function __validatePool(address _pool) private view {
        require(
            IMaplePoolFactory(MAPLE_POOL_FACTORY).isPool(_pool),
            "__validatePool: Invalid pool"
        );
    }

    // Validates that a rewards contract has been deployed from the Maple rewards factory
    function __validateRewardsContract(address _rewardsContract) private view {
        require(
            IMapleMplRewardsFactory(MAPLE_MPL_REWARDS_FACTORY).isMplRewards(_rewardsContract),
            "__validateRewardsContract: Invalid rewards contract"
        );
    }
}
