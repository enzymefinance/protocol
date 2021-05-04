// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../core/fund/debt-positions/CompoundDebtPositionLib.sol";
import "../../core/fund/debt-positions/DebtPositionProxy.sol";
import "../../infrastructure/price-feeds/derivatives/IDerivativePriceFeed.sol";
import "../../infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";
import "../../infrastructure/price-feeds/derivatives/feeds/CompoundPriceFeed.sol";
import "../../utils/AddressArrayLib.sol";
import "../utils/ExtensionBase.sol";
import "../utils/PermissionedVaultActionMixin.sol";

/// @title DebtPositionManager
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Extension to handle debt position actions for funds
contract DebtPositionManager is ExtensionBase, PermissionedVaultActionMixin {
    using AddressArrayLib for address[];
    using SafeMath for uint256;

    event DebtPositionDeployed(
        address indexed comptrollerProxy,
        address indexed vaultProxy,
        address debtPosition,
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

    enum DebtPositionManagerActions {CreateDebtPosition, CallOnDebtPosition, RemoveDebtPosition}

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
    // CALL-ON-DEBT-POSITION ACTIONS //
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
        if (_actionId == uint256(DebtPositionManagerActions.CreateDebtPosition)) {
            __createDebtPosition(vaultProxy);
        } else if (_actionId == uint256(DebtPositionManagerActions.CallOnDebtPosition)) {
            __executeCallOnDebtPosition(vaultProxy, _callArgs);
        } else if (_actionId == uint256(DebtPositionManagerActions.RemoveDebtPosition)) {
            __removeDebtPosition(vaultProxy, _callArgs);
        } else {
            revert("receiveCallFromComptroller: Invalid _actionId");
        }
    }

    // PRIVATE FUNCTIONS

    // Performs an action on a specific debt position, validating the incoming arguments and the final result
    function __executeCallOnDebtPosition(address _vaultProxy, bytes memory _callArgs) private {
        (address debtPosition, uint256 protocol, uint256 actionId, bytes memory actionArgs) = abi
            .decode(_callArgs, (address, uint256, uint256, bytes));

        // Validate incoming arguments, and decode them if valid
        __preCallOnDebtPosition(_vaultProxy, debtPosition, protocol, actionId, actionArgs);

        (address[] memory assets, uint256[] memory amounts, ) = abi.decode(
            actionArgs,
            (address[], uint256[], bytes)
        );

        // Prepare arguments for the callOnDebtPosition
        bytes memory actionData = abi.encode(actionId, actionArgs);

        address[] memory assetsToTransfer;
        uint256[] memory amountsToTransfer;
        address[] memory assetsToReceive;

        if (
            actionId == uint256(IDebtPosition.DebtPositionActions.AddCollateral) ||
            actionId == uint256(IDebtPosition.DebtPositionActions.RepayBorrow)
        ) {
            assetsToTransfer = assets;
            amountsToTransfer = amounts;
        } else if (
            actionId == uint256(IDebtPosition.DebtPositionActions.Borrow) ||
            actionId == uint256(IDebtPosition.DebtPositionActions.RemoveCollateral)
        ) {
            assetsToReceive = assets;
        }

        // Execute callOnDebtPosition
        __callOnDebtPosition(
            msg.sender,
            abi.encode(
                debtPosition,
                actionData,
                assetsToTransfer,
                amountsToTransfer,
                assetsToReceive
            )
        );
    }

    /// @dev Creates a new debt position and links it to the _vaultProxy.
    /// Currently only handles the logic for Compound.
    /// Can be extended through an additional _callArgs param to support more protocols.
    function __createDebtPosition(address _vaultProxy) private {
        bytes memory initData = abi.encode(_vaultProxy);

        bytes memory constructData = abi.encodeWithSelector(
            CompoundDebtPositionLib.init.selector,
            initData
        );

        address debtPosition = address(
            new DebtPositionProxy(constructData, COMPOUND_DEBT_POSITION_LIB, COMPOUND_PROTOCOL_ID)
        );

        emit DebtPositionDeployed(msg.sender, _vaultProxy, debtPosition, COMPOUND_PROTOCOL_ID, "");

        __addDebtPosition(msg.sender, debtPosition);
    }

    /// @dev Helper to check if an asset is supported
    function __isSupportedAsset(address _asset) private view returns (bool isSupported_) {
        return
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_asset) ||
            IDerivativePriceFeed(DERIVATIVE_PRICE_FEED).isSupportedAsset(_asset);
    }

    /// @dev Runs previous validations before running a call on debt position
    function __preCallOnDebtPosition(
        address _vaultProxy,
        address _debtPosition,
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
            "__preCallOnDebtPosition: Assets and amounts arrays unequal"
        );

        require(assets.isUniqueSet(), "__preCallOnDebtPosition: Duplicate asset");

        __validateDebtPosition(_vaultProxy, _debtPosition);

        for (uint256 i; i < assets.length; i++) {
            require(assets[i] != address(0), "__preCallOnDebtPosition: Empty asset included");

            require(amounts[i] > 0, "__preCallOnDebtPosition: Amount must be > 0");

            require(__isSupportedAsset(assets[i]), "__preCallOnDebtPosition: Unsupported asset");
        }

        // Protocol specific validation (e.g cTokens)
        __validateProtocolData(_protocol, _actionId, _actionArgs);
    }

    /// @dev Removes a debt position from the VaultProxy
    function __removeDebtPosition(address, bytes memory _callArgs) private {
        address debtPosition = abi.decode(_callArgs, (address));

        (address[] memory collateralAssets, ) = IDebtPosition(debtPosition).getCollateralAssets();
        require(
            collateralAssets.length == 0,
            "__removeDebtPosition: Debt position holds collateral assets"
        );

        (address[] memory borrowedAssets, ) = IDebtPosition(debtPosition).getBorrowedAssets();
        require(
            borrowedAssets.length == 0,
            "__removeDebtPosition: Debt position has unpaid borrowed assets"
        );

        __removeDebtPosition(msg.sender, debtPosition);
    }

    /// @dev Validates the `data` field of a compound debt position
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
            _actionId == uint256(IDebtPosition.DebtPositionActions.Borrow) ||
            _actionId == uint256(IDebtPosition.DebtPositionActions.RepayBorrow)
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

    /// @dev Helper to validate a debtPosition.
    function __validateDebtPosition(address _vaultProxy, address _debtPosition) private view {
        require(
            IVault(_vaultProxy).isActiveDebtPosition(_debtPosition),
            "__validateDebtPosition: Debt position is not valid"
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

    /// @dev Validates the `data` field of a call on debt position. Currently used for only one protocol
    /// Designed to scale to multiple debt position protocols
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
