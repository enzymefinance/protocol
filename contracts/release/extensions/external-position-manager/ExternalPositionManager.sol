// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../core/fund/external-positions/CompoundDebtPositionLib.sol";
import "../../core/fund/external-positions/ExternalPositionProxy.sol";
import "../../infrastructure/price-feeds/derivatives/IDerivativePriceFeed.sol";
import "../../infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";
import "../../infrastructure/price-feeds/derivatives/feeds/CompoundPriceFeed.sol";
import "../../utils/AddressArrayLib.sol";
import "../utils/ExtensionBase.sol";
import "../utils/PermissionedVaultActionMixin.sol";

/// @title ExternalPositionManager
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Extension to handle external position actions for funds
contract ExternalPositionManager is ExtensionBase, PermissionedVaultActionMixin {
    using AddressArrayLib for address[];
    using SafeMath for uint256;

    event ExternalPositionDeployed(
        address indexed comptrollerProxy,
        address indexed vaultProxy,
        address externalPosition,
        uint256 protocol,
        bytes data
    );

    // NOTE: To be converted to an enum when more protocols are included
    uint256 private constant COMPOUND_PROTOCOL_ID = 0;

    address private immutable DERIVATIVE_PRICE_FEED;
    address private immutable PRIMITIVE_PRICE_FEED;

    // Compound specific params
    address private immutable COMPOUND_COMPTROLLER;
    address private immutable COMPOUND_DEBT_POSITION_LIB;
    address private immutable COMPOUND_PRICE_FEED;

    address private immutable WETH_TOKEN;

    enum ExternalPositionManagerActions {
        CreateExternalPosition,
        CallOnExternalPosition,
        RemoveExternalPosition
    }

    constructor(
        address _derivativePriceFeed,
        address _primitivePriceFeed,
        address _weth,
        address _compoundPriceFeed,
        address _compoundComptroller,
        address _compoundDebtPositionLib
    ) public {
        COMPOUND_COMPTROLLER = _compoundComptroller;
        COMPOUND_DEBT_POSITION_LIB = _compoundDebtPositionLib;
        COMPOUND_PRICE_FEED = _compoundPriceFeed;
        DERIVATIVE_PRICE_FEED = _derivativePriceFeed;
        PRIMITIVE_PRICE_FEED = _primitivePriceFeed;
        WETH_TOKEN = _weth;
    }

    /////////////
    // GENERAL //
    /////////////

    /// @notice Activates the extension by storing the VaultProxy
    function activateForFund(bool) external override {
        __setValidatedVaultProxy(msg.sender);
    }

    ////////////////////////////////////
    // CALL-ON-EXTERNAL-POSITION ACTIONS //
    //////////////////////////////////

    /// @notice Receives a dispatched `callOnExtension` from a fund's ComptrollerProxy
    /// @param _caller The user who called for this action
    /// @param _actionId An ID representing the desired action
    /// @param _callArgs The encoded args for the action
    function receiveCallFromComptroller(
        address _caller,
        uint256 _actionId,
        bytes calldata _callArgs
    ) external override {
        address vaultProxy = comptrollerProxyToVaultProxy[msg.sender];
        require(vaultProxy != address(0), "receiveCallFromComptroller: Fund is not active");

        __validateIsFundOwner(vaultProxy, _caller);

        // Dispatch the action
        if (_actionId == uint256(ExternalPositionManagerActions.CreateExternalPosition)) {
            __createExternalPosition(vaultProxy);
        } else if (_actionId == uint256(ExternalPositionManagerActions.CallOnExternalPosition)) {
            __executeCallOnExternalPosition(vaultProxy, _callArgs);
        } else if (_actionId == uint256(ExternalPositionManagerActions.RemoveExternalPosition)) {
            __removeExternalPosition(vaultProxy, _callArgs);
        } else {
            revert("receiveCallFromComptroller: Invalid _actionId");
        }
    }

    // PRIVATE FUNCTIONS

    // Performs an action on a specific external position, validating the incoming arguments and the final result
    function __executeCallOnExternalPosition(address _vaultProxy, bytes memory _callArgs) private {
        (
            address externalPosition,
            uint256 protocol,
            uint256 actionId,
            bytes memory actionArgs
        ) = abi.decode(_callArgs, (address, uint256, uint256, bytes));

        // Validate incoming arguments, and decode them if valid
        __preCallOnExternalPosition(_vaultProxy, externalPosition, protocol, actionId, actionArgs);

        (address[] memory assets, uint256[] memory amounts, ) = abi.decode(
            actionArgs,
            (address[], uint256[], bytes)
        );

        // Prepare arguments for the callOnExternalPosition
        bytes memory actionData = abi.encode(actionId, actionArgs);

        address[] memory assetsToTransfer;
        uint256[] memory amountsToTransfer;
        address[] memory assetsToReceive;

        if (
            actionId == uint256(IExternalPosition.ExternalPositionActions.AddCollateral) ||
            actionId == uint256(IExternalPosition.ExternalPositionActions.RepayBorrow)
        ) {
            assetsToTransfer = assets;
            amountsToTransfer = amounts;
        } else if (
            actionId == uint256(IExternalPosition.ExternalPositionActions.Borrow) ||
            actionId == uint256(IExternalPosition.ExternalPositionActions.RemoveCollateral)
        ) {
            assetsToReceive = assets;
        }

        // Execute callOnExternalPosition
        __callOnExternalPosition(
            msg.sender,
            abi.encode(
                externalPosition,
                actionData,
                assetsToTransfer,
                amountsToTransfer,
                assetsToReceive
            )
        );
    }

    /// @dev Creates a new external position and links it to the _vaultProxy.
    /// Currently only handles the logic for Compound.
    /// Can be extended through an additional _callArgs param to support more protocols.
    function __createExternalPosition(address _vaultProxy) private {
        bytes memory initData = abi.encode(_vaultProxy);

        bytes memory constructData = abi.encodeWithSelector(
            CompoundDebtPositionLib.init.selector,
            initData
        );

        address externalPosition = address(
            new ExternalPositionProxy(
                constructData,
                COMPOUND_DEBT_POSITION_LIB,
                COMPOUND_PROTOCOL_ID
            )
        );

        emit ExternalPositionDeployed(
            msg.sender,
            _vaultProxy,
            externalPosition,
            COMPOUND_PROTOCOL_ID,
            ""
        );

        __addExternalPosition(msg.sender, externalPosition);
    }

    /// @dev Helper to check if an asset is supported
    function __isSupportedAsset(address _asset) private view returns (bool isSupported_) {
        return
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_asset) ||
            IDerivativePriceFeed(DERIVATIVE_PRICE_FEED).isSupportedAsset(_asset);
    }

    /// @dev Runs previous validations before running a call on external position
    function __preCallOnExternalPosition(
        address _vaultProxy,
        address _externalPosition,
        uint256 _protocol,
        uint256 _actionId,
        bytes memory _actionArgs
    ) private view {
        (address[] memory assets, uint256[] memory amounts, ) = abi.decode(
            _actionArgs,
            (address[], uint256[], bytes)
        );

        require(
            assets.length == amounts.length,
            "__preCallOnExternalPosition: Assets and amounts arrays unequal"
        );

        require(assets.isUniqueSet(), "__preCallOnExternalPosition: Duplicate asset");

        __validateExternalPosition(_vaultProxy, _externalPosition);

        for (uint256 i; i < assets.length; i++) {
            require(assets[i] != address(0), "__preCallOnExternalPosition: Empty asset included");

            require(amounts[i] > 0, "__preCallOnExternalPosition: Amount must be > 0");

            require(
                __isSupportedAsset(assets[i]),
                "__preCallOnExternalPosition: Unsupported asset"
            );
        }

        // Protocol specific validation (e.g cTokens)
        __validateProtocolData(_protocol, _actionId, _actionArgs);
    }

    /// @dev Removes a external position from the VaultProxy
    function __removeExternalPosition(address, bytes memory _callArgs) private {
        address externalPosition = abi.decode(_callArgs, (address));

        (address[] memory collateralAssets, ) = IExternalPosition(externalPosition)
            .getCollateralAssets();
        require(
            collateralAssets.length == 0,
            "__removeExternalPosition: External position holds collateral assets"
        );

        (address[] memory borrowedAssets, ) = IExternalPosition(externalPosition)
            .getBorrowedAssets();
        require(
            borrowedAssets.length == 0,
            "__removeExternalPosition: External position has unpaid borrowed assets"
        );

        __removeExternalPosition(msg.sender, externalPosition);
    }

    /// @dev Validates the `data` field of a compound external position
    function __validateCompoundData(uint256 _actionId, bytes memory _actionArgs) private view {
        (address[] memory assets, , bytes memory data) = abi.decode(
            _actionArgs,
            (address[], uint256[], bytes)
        );

        address[] memory cTokens = abi.decode(data, (address[]));

        require(
            cTokens.length == assets.length,
            "__validateCompoundData: Unequal token and cToken length"
        );

        if (
            _actionId == uint256(IExternalPosition.ExternalPositionActions.Borrow) ||
            _actionId == uint256(IExternalPosition.ExternalPositionActions.RepayBorrow)
        ) {
            for (uint256 i; i < cTokens.length; i++) {
                // No need to assert from an address(0) tokenFromCToken since assets[i] cannot be '0' at this point.
                require(
                    CompoundPriceFeed(COMPOUND_PRICE_FEED).getTokenFromCToken(cTokens[i]) ==
                        assets[i],
                    "__validateCompoundData: Bad token cToken pair"
                );
            }
        }
    }

    /// @dev Helper to validate a externalPosition.
    function __validateExternalPosition(address _vaultProxy, address _externalPosition)
        private
        view
    {
        require(
            IVault(_vaultProxy).isActiveExternalPosition(_externalPosition),
            "__validateExternalPosition: External position is not valid"
        );
    }

    /// @dev Helper to validate fund owner.
    /// Preferred to a modifier because allows gas savings if re-using _vaultProxy.
    function __validateIsFundOwner(address _vaultProxy, address _who) private view {
        require(
            _who == IVault(_vaultProxy).getOwner(),
            "__validateIsFundOwner: Only the fund owner can call this function"
        );
    }

    /// @dev Validates the `data` field of a call on external position. Currently used for only one protocol
    /// Designed to scale to multiple external position protocols
    function __validateProtocolData(
        uint256 _protocol,
        uint256 _actionId,
        bytes memory _actionArgs
    ) private view {
        if (_protocol == COMPOUND_PROTOCOL_ID) {
            __validateCompoundData(_actionId, _actionArgs);
        } else {
            revert("__validateProtocolData: Invalid protocol");
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `COMPOUND_PRICE_FEED` variable
    /// @return compoundPriceFeed_ The `COMPOUND_PRICE_FEED` variable value
    function getCompoundPriceFeed() external view returns (address compoundPriceFeed_) {
        return COMPOUND_PRICE_FEED;
    }

    /// @notice Gets the `COMPOUND_COMPTROLLER` variable
    /// @return compoundComptroller_ The `COMPOUND_COMPTROLLER` variable value
    function getCompoundComptroller() external view returns (address compoundComptroller_) {
        return COMPOUND_COMPTROLLER;
    }

    /// @notice Gets the `COMPOUND_PROTOCOL_ID` variable
    /// @return compoundProtocolId_ The `COMPOUND_PROTOCOL_ID` variable value
    function getCompoundProtocolId() external pure returns (uint256 compoundProtocolId_) {
        return COMPOUND_PROTOCOL_ID;
    }

    /// @notice Gets the `DERIVATIVE_PRICE_FEED` variable
    /// @return derivativePriceFeed_ The `DERIVATIVE_PRICE_FEED` variable value
    function getDerivativePriceFeed() external view returns (address derivativePriceFeed_) {
        return DERIVATIVE_PRICE_FEED;
    }

    /// @notice Gets the `PRIMITIVE_PRICE_FEED` variable
    /// @return primitivePriceFeed_ The `PRIMITIVE_PRICE_FEED` variable value
    function getPrimitivePriceFeed() external view returns (address primitivePriceFeed_) {
        return PRIMITIVE_PRICE_FEED;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
