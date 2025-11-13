// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {
    IMorpho,
    MarketParams as MorphoLibMarketParams,
    MorphoBalancesLib
} from "morpho-blue/periphery/MorphoBalancesLib.sol";

import {IMorphoBlue} from "../../../../../external-interfaces/IMorphoBlue.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {Bytes32ArrayLib} from "../../../../../utils/0.8.19/Bytes32ArrayLib.sol";
import {Uint256ArrayLib} from "../../../../../utils/0.8.19/Uint256ArrayLib.sol";
import {AssetHelpers} from "../../../../../utils/0.8.19/AssetHelpers.sol";
import {IUintListRegistry} from "../../../../../persistent/uint-list-registry/IUintListRegistry.sol";
import {MorphoBluePositionLibBase1} from "./bases/MorphoBluePositionLibBase1.sol";
import {IMorphoBluePosition} from "./IMorphoBluePosition.sol";
import {MorphoBluePositionDataDecoder} from "./MorphoBluePositionDataDecoder.sol";

/// @title MorphoBluePositionLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice An External Position library contract for Morpho Blue Positions
/// @dev The Enzyme Foundation maintains a list of allowed Morpho Blue vaults (a list of market ids).
/// If the vault is not in the list:
/// - asset managers will only be able to make "unwinding" actions, i.e., Redeem, RemoveCollateral, and Repay
/// - position value calculations will revert until the vault is completely unwound
contract MorphoBluePositionLib is
    IMorphoBluePosition,
    MorphoBluePositionDataDecoder,
    MorphoBluePositionLibBase1,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using Bytes32ArrayLib for bytes32[];
    using Uint256ArrayLib for uint256[];

    uint256 private immutable ALLOWED_MORPHO_BLUE_VAULTS_LIST_ID;
    IMorphoBlue private immutable MORPHO_BLUE;
    IUintListRegistry internal immutable UINT_LIST_REGISTRY;

    error DisallowedMarket();

    error InvalidActionId();

    constructor(uint256 _allowedMorphoBlueVaultsListId, address _morphoBlueAddress, address _uintListRegistryAddress) {
        ALLOWED_MORPHO_BLUE_VAULTS_LIST_ID = _allowedMorphoBlueVaultsListId;
        MORPHO_BLUE = IMorphoBlue(_morphoBlueAddress);
        UINT_LIST_REGISTRY = IUintListRegistry(_uintListRegistryAddress);
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.Lend)) {
            __lend(actionArgs);
        } else if (actionId == uint256(Actions.Redeem)) {
            __redeem(actionArgs);
        } else if (actionId == uint256(Actions.AddCollateral)) {
            __addCollateral(actionArgs);
        } else if (actionId == uint256(Actions.RemoveCollateral)) {
            __removeCollateral(actionArgs);
        } else if (actionId == uint256(Actions.Borrow)) {
            __borrow(actionArgs);
        } else if (actionId == uint256(Actions.Repay)) {
            __repay(actionArgs);
        } else {
            revert InvalidActionId();
        }
    }

    /// @dev Helper to supply an asset to a Morpho Blue lending market
    function __lend(bytes memory _actionArgs) private {
        (bytes32 marketId, uint256 assetAmount) = __decodeLendActionArgs(_actionArgs);

        __validateMarketId({_marketId: marketId});

        IMorphoBlue.MarketParams memory marketParams = MORPHO_BLUE.idToMarketParams({_id: marketId});

        __addMarketId({_marketId: marketId});

        // Approve the Morpho Blue contract to spend the asset
        __approveAssetMaxAsNeeded({
            _asset: marketParams.loanToken, _target: address(MORPHO_BLUE), _neededAmount: assetAmount
        });

        // Lend the asset
        MORPHO_BLUE.supply({
            _marketParams: marketParams, _assets: assetAmount, _shares: 0, _onBehalf: address(this), _data: ""
        });
    }

    /// @dev Helper to redeem an asset from a Morpho Blue lending position
    function __redeem(bytes memory _actionArgs) private {
        (bytes32 marketId, uint256 sharesAmount) = __decodeRedeemActionArgs(_actionArgs);

        // Withdraw the asset
        MORPHO_BLUE.withdraw({
            _marketParams: MORPHO_BLUE.idToMarketParams({_id: marketId}),
            _assets: 0,
            _shares: sharesAmount,
            _onBehalf: address(this),
            _receiver: msg.sender
        });

        __cleanupMarketId({_marketId: marketId});
    }

    /// @dev Helper to add collateral to a Morpho Blue lending market
    function __addCollateral(bytes memory _actionArgs) private {
        (bytes32 marketId, uint256 collateralAmount) = __decodeAddCollateralActionArgs(_actionArgs);

        __validateMarketId({_marketId: marketId});

        IMorphoBlue.MarketParams memory marketParams = MORPHO_BLUE.idToMarketParams({_id: marketId});

        __addMarketId({_marketId: marketId});

        // Approve the Morpho Blue contract to spend the asset
        __approveAssetMaxAsNeeded({
            _asset: marketParams.collateralToken, _target: address(MORPHO_BLUE), _neededAmount: collateralAmount
        });

        // Add the collateral
        MORPHO_BLUE.supplyCollateral({
            _marketParams: marketParams, _assets: collateralAmount, _onBehalf: address(this), _data: ""
        });
    }

    /// @dev Helper to remove collateral from a Morpho Blue lending market
    function __removeCollateral(bytes memory _actionArgs) private {
        (bytes32 marketId, uint256 collateralAmount) = __decodeRemoveCollateralActionArgs(_actionArgs);

        // Remove the collateral
        MORPHO_BLUE.withdrawCollateral({
            _marketParams: MORPHO_BLUE.idToMarketParams({_id: marketId}),
            _assets: collateralAmount,
            _onBehalf: address(this),
            _receiver: msg.sender
        });

        __cleanupMarketId({_marketId: marketId});
    }

    /// @dev Helper to borrow an asset from a Morpho Blue lending market
    function __borrow(bytes memory _actionsArgs) private {
        (bytes32 marketId, uint256 borrowAmount) = __decodeBorrowActionArgs(_actionsArgs);

        __validateMarketId({_marketId: marketId});

        // This is necessary because even though in almost all cases collateral would be added by the EP itself before borrowing,
        // it is possible to another address to provide collateral on behalf of the EP, therefore allowing the EP to take a loan
        // with a yet untracked marketId.
        __addMarketId({_marketId: marketId});

        // Borrow the asset
        MORPHO_BLUE.borrow({
            _marketParams: MORPHO_BLUE.idToMarketParams({_id: marketId}),
            _assets: borrowAmount,
            _shares: 0,
            _onBehalf: address(this),
            _receiver: msg.sender
        });
    }

    /// @dev Helper to repay a borrowed asset from a Morpho Blue lending market
    function __repay(bytes memory _actionsArgs) private {
        (bytes32 marketId, uint256 repayAmount) = __decodeRepayActionArgs(_actionsArgs);

        IMorphoBlue.MarketParams memory marketParams = MORPHO_BLUE.idToMarketParams({_id: marketId});

        __approveAssetMaxAsNeeded({
            _asset: marketParams.loanToken, _target: address(MORPHO_BLUE), _neededAmount: repayAmount
        });

        // Repay the borrowed asset
        // If repayAmount is max, the shares arg should be used to avoid rounding errors as per MorphoBlue docs
        // src: https://docs.morpho.org/contracts/morpho-blue/reference/morpho-blue/#repay
        if (repayAmount == type(uint256).max) {
            IMorphoBlue.Position memory position = MORPHO_BLUE.position({_id: marketId, _user: address(this)});

            MORPHO_BLUE.repay({
                _marketParams: marketParams,
                _assets: 0,
                _shares: position.borrowShares,
                _onBehalf: address(this),
                _data: ""
            });
        } else {
            MORPHO_BLUE.repay({
                _marketParams: marketParams, _assets: repayAmount, _shares: 0, _onBehalf: address(this), _data: ""
            });
        }

        __cleanupMarketId({_marketId: marketId});
    }

    /// @dev Helper to delete marketId from storage when no longer needed
    function __cleanupMarketId(bytes32 _marketId) private {
        IMorphoBlue.Position memory position = MORPHO_BLUE.position({_id: _marketId, _user: address(this)});
        // If the market is not used for supply-side or borrow-side, it can be removed from storage

        if (position.supplyShares == 0 && position.borrowShares == 0 && position.collateral == 0) {
            marketIds.removeStorageItem(_marketId);
            emit MarketIdRemoved(_marketId);
        }
    }

    /// @dev Helper to add the marketId to storage if not already present
    function __addMarketId(bytes32 _marketId) private {
        if (!marketIds.contains(_marketId)) {
            marketIds.push(_marketId);
            emit MarketIdAdded(_marketId);
        }
    }

    /// @dev Helper to validate that the marketId is allowed
    /// Throws if disallowed
    function __validateMarketId(bytes32 _marketId) private view {
        if (!UINT_LIST_REGISTRY.isInList(ALLOWED_MORPHO_BLUE_VAULTS_LIST_ID, uint256(_marketId))) {
            revert DisallowedMarket();
        }
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        bytes32[] memory marketIdsMem = getMarketIds();

        for (uint256 i; i < marketIdsMem.length; i++) {
            // No need to call __validateMarketId() here, since:
            // - getManagedAssets() is always called by ComptrollerProxy in the same tx
            // - collateral is always present when debt is

            // Skip if there is no borrowed value
            if (MORPHO_BLUE.position({_id: marketIdsMem[i], _user: address(this)}).borrowShares == 0) {
                continue;
            }

            IMorphoBlue.MarketParams memory marketParams = MORPHO_BLUE.idToMarketParams({_id: marketIdsMem[i]});

            uint256 totalBorrowAssets = MorphoBalancesLib.expectedBorrowAssets({
                morpho: IMorpho(address(MORPHO_BLUE)),
                marketParams: MorphoLibMarketParams({
                    loanToken: marketParams.loanToken,
                    collateralToken: marketParams.collateralToken,
                    oracle: marketParams.oracle,
                    irm: marketParams.irm,
                    lltv: marketParams.lltv
                }),
                user: address(this)
            });

            assets_ = assets_.addItem(marketParams.loanToken);
            amounts_ = amounts_.addItem(totalBorrowAssets);
        }

        return __aggregateAssetAmounts({_rawAssets: assets_, _rawAmounts: amounts_});
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev There are 2 ways that positive value can be contributed to this position
    /// 1. Tokens supplied for lending
    /// 2. Tokens deposited as collateral
    function getManagedAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        bytes32[] memory marketIdsMem = getMarketIds();

        for (uint256 i; i < marketIdsMem.length; i++) {
            IMorphoBlue.Position memory position = MORPHO_BLUE.position({_id: marketIdsMem[i], _user: address(this)});

            // Skip if there is no supply or collateral in the position
            if (position.supplyShares == 0 && position.collateral == 0) {
                continue;
            }

            __validateMarketId({_marketId: marketIdsMem[i]});

            IMorphoBlue.MarketParams memory marketParams = MORPHO_BLUE.idToMarketParams({_id: marketIdsMem[i]});

            // 1. Value from lending
            if (position.supplyShares > 0) {
                uint256 expectedSupplyAssets = MorphoBalancesLib.expectedSupplyAssets({
                    morpho: IMorpho(address(MORPHO_BLUE)),
                    marketParams: MorphoLibMarketParams({
                        loanToken: marketParams.loanToken,
                        collateralToken: marketParams.collateralToken,
                        oracle: marketParams.oracle,
                        irm: marketParams.irm,
                        lltv: marketParams.lltv
                    }),
                    user: address(this)
                });

                assets_ = assets_.addItem(marketParams.loanToken);
                amounts_ = amounts_.addItem(expectedSupplyAssets);
            }

            // 2. Value from deposited collateral
            if (position.collateral > 0) {
                assets_ = assets_.addItem(marketParams.collateralToken);
                amounts_ = amounts_.addItem(position.collateral);
            }
        }

        return __aggregateAssetAmounts({_rawAssets: assets_, _rawAmounts: amounts_});
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Get the marketIds of the external position
    /// @return marketIds_ The marketIds
    function getMarketIds() public view override returns (bytes32[] memory marketIds_) {
        return marketIds;
    }
}
