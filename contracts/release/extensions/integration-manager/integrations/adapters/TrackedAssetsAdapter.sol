// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../infrastructure/value-interpreter/ValueInterpreter.sol";
import "../../../utils/FundDeployerOwnerMixin.sol";
import "../utils/AdapterBase.sol";

/// @title TrackedAssetsAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter to add tracked assets to a fund (useful e.g. to handle token airdrops)
contract TrackedAssetsAdapter is AdapterBase, FundDeployerOwnerMixin {
    event DustToleranceInWethSet(uint256 nextDustToleranceInWeth);

    address private immutable VALUE_INTERPRETER;
    address private immutable WETH_TOKEN;

    uint256 private dustToleranceInWeth;

    constructor(
        address _fundDeployer,
        address _integrationManager,
        address _valueInterpreter,
        address _wethToken
    ) public AdapterBase(_integrationManager) FundDeployerOwnerMixin(_fundDeployer) {
        VALUE_INTERPRETER = _valueInterpreter;
        WETH_TOKEN = _wethToken;

        dustToleranceInWeth = 0.01 ether;
    }

    /// @notice Add multiple assets to the Vault's list of tracked assets
    /// @dev No need to perform any validation or implement any logic
    function addTrackedAssets(
        address,
        bytes calldata,
        bytes calldata
    ) external view {}

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "TRACKED_ASSETS";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == ADD_TRACKED_ASSETS_SELECTOR) {
            incomingAssets_ = __decodeAddTrackedAssetsCallArgs(_encodedCallArgs);

            minIncomingAssetAmounts_ = new uint256[](incomingAssets_.length);
            for (uint256 i; i < minIncomingAssetAmounts_.length; i++) {
                minIncomingAssetAmounts_[i] = 1;
            }
        } else if (_selector == REMOVE_TRACKED_ASSETS_SELECTOR) {
            spendAssets_ = __decodeRemoveTrackedAssetsCallArgs(_encodedCallArgs);
            spendAssetAmounts_ = new uint256[](spendAssets_.length);
            for (uint256 i; i < spendAssetAmounts_.length; i++) {
                spendAssetAmounts_[i] = 1;
            }

            spendAssetsHandleType_ = IIntegrationManager.SpendAssetsHandleType.Remove;
        } else {
            revert("parseAssetsForMethod: _selector invalid");
        }

        return (
            spendAssetsHandleType_,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @notice Removes multiple assets from the Vault's list of tracked assets
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @dev No need to validate caller
    function removeTrackedAssets(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata
    ) external {
        address[] memory spendAssets = __decodeRemoveTrackedAssetsCallArgs(_encodedCallArgs);
        uint256 dustToleranceInWethCopy = dustToleranceInWeth;
        for (uint256 i; i < spendAssets.length; i++) {
            (uint256 valueInWeth, bool isValid) = ValueInterpreter(VALUE_INTERPRETER)
                .calcCanonicalAssetValue(
                spendAssets[i],
                ERC20(spendAssets[i]).balanceOf(_vaultProxy),
                WETH_TOKEN
            );
            require(isValid, "removeTrackedAssets: Invalid GAV");
            require(
                valueInWeth <= dustToleranceInWethCopy,
                "removeTrackedAssets: Exceeds dust threshold"
            );
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded call arguments to addTrackedAssets()
    function __decodeAddTrackedAssetsCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (address[] memory incomingAssets_)
    {
        return abi.decode(_encodedCallArgs, (address[]));
    }

    /// @dev Helper to decode the encoded call arguments to removeTrackedAssets()
    function __decodeRemoveTrackedAssetsCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (address[] memory spendAssets_)
    {
        return abi.decode(_encodedCallArgs, (address[]));
    }

    ////////////////////
    // DUST TOLERANCE //
    ////////////////////

    /// @notice Sets the dustToleranceInWeth variable value
    /// @param _nextDustToleranceInWeth The next dustToleranceInWeth value
    function setDustToleranceInWeth(uint256 _nextDustToleranceInWeth)
        external
        onlyFundDeployerOwner
    {
        dustToleranceInWeth = _nextDustToleranceInWeth;

        emit DustToleranceInWethSet(_nextDustToleranceInWeth);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `dustToleranceInWeth` variable value
    /// @return dustToleranceInWeth_ The `dustToleranceInWeth` variable value
    function getDustToleranceInWeth() external view returns (uint256 dustToleranceInWeth_) {
        return dustToleranceInWeth;
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable value
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() external view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
