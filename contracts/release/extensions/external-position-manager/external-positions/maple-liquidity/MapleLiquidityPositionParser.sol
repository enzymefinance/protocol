// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../../external-interfaces/IMapleV1MplRewardsFactory.sol";
import "../../../../../external-interfaces/IMapleV2Globals.sol";
import "../../../../../external-interfaces/IMapleV2Pool.sol";
import "../../../../../external-interfaces/IMapleV2PoolManager.sol";
import "../../../../../external-interfaces/IMapleV2ProxyFactory.sol";
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
    address private immutable MAPLE_V2_GLOBALS;

    constructor(address _mapleV2Globals, address _mapleV1MplRewardsFactory) public {
        MAPLE_V1_MPL_REWARDS_FACTORY = _mapleV1MplRewardsFactory;
        MAPLE_V2_GLOBALS = _mapleV2Globals;
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

    // Validates that a pool v2 has been deployed from a Maple factory
    function __validatePoolV2(address _poolV2) private view {
        address poolManager = IMapleV2Pool(_poolV2).manager();
        require(
            IMapleV2PoolManager(poolManager).pool() == _poolV2,
            "__validatePoolV2: Invalid PoolManager relation"
        );

        address poolManagerFactory = IMapleV2PoolManager(poolManager).factory();
        require(
            IMapleV2ProxyFactory(poolManagerFactory).isInstance(poolManager),
            "__validatePoolV2: Invalid PoolManagerFactory relation"
        );

        require(
            IMapleV2Globals(MAPLE_V2_GLOBALS).isFactory("POOL_MANAGER", poolManagerFactory),
            "__validatePoolV2: Invalid Globals relation"
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
