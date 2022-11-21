// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../interfaces/IMapleV1MplRewardsFactory.sol";
import "../../../../interfaces/IMapleV2Pool.sol";
import "../../../../interfaces/IMapleV2ProxyFactory.sol";
import "../IExternalPositionParser.sol";
import "./IMapleLiquidityPosition.sol";
import "./MapleLiquidityPositionDataDecoder.sol";

pragma solidity 0.6.12;

/// @title MapleLiquidityPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Maple liquidity positions
contract MapleLiquidityPositionParser is
    MapleLiquidityPositionDataDecoder,
    IExternalPositionParser
{
    address private immutable MAPLE_V1_MPL_REWARDS_FACTORY;
    address private immutable MAPLE_V2_POOL_FACTORY;

    constructor(address _mapleV2PoolFactory, address _mapleV1MplRewardsFactory) public {
        MAPLE_V1_MPL_REWARDS_FACTORY = _mapleV1MplRewardsFactory;
        MAPLE_V2_POOL_FACTORY = _mapleV2PoolFactory;
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
        if (_actionId == uint256(IMapleLiquidityPosition.Actions.LendV2)) {
            (address pool, uint256 liquidityAssetAmount) = __decodeLendV2ActionArgs(
                _encodedActionArgs
            );
            __validatePoolV2(pool);

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);

            assetsToTransfer_[0] = IMapleV2Pool(pool).asset();
            amountsToTransfer_[0] = liquidityAssetAmount;
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.RequestRedeemV2)) {
            (address pool, ) = __decodeRequestRedeemV2ActionArgs(_encodedActionArgs);
            __validatePoolV2(pool);
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.RedeemV2)) {
            (address pool, ) = __decodeRedeemV2ActionArgs(_encodedActionArgs);
            __validatePoolV2(pool);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = IMapleV2Pool(pool).asset();
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.CancelRedeemV2)) {
            (address pool, ) = __decodeCancelRedeemV2ActionArgs(_encodedActionArgs);
            __validatePoolV2(pool);
        } else if (_actionId == uint256(IMapleLiquidityPosition.Actions.ClaimRewardsV1)) {
            address rewardsContract = __decodeClaimRewardsV1ActionArgs(_encodedActionArgs);
            __validateRewardsContract(rewardsContract);
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

    // Validates that a pool v2 has been deployed from the Maple pool factory
    function __validatePoolV2(address _poolV2) private view {
        require(
            IMapleV2ProxyFactory(MAPLE_V2_POOL_FACTORY).isInstance(_poolV2),
            "__validatePoolV2: Invalid pool"
        );
    }

    // Validates that a rewards contract has been deployed from the Maple rewards factory
    function __validateRewardsContract(address _rewardsContract) private view {
        require(
            IMapleV1MplRewardsFactory(MAPLE_V1_MPL_REWARDS_FACTORY).isMplRewards(_rewardsContract),
            "__validateRewardsContract: Invalid rewards contract"
        );
    }
}
