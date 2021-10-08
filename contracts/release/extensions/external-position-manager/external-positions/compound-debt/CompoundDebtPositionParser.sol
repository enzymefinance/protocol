// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../../persistent/external-positions/IExternalPosition.sol";
import "../../../../infrastructure/price-feeds/derivatives/feeds/CompoundPriceFeed.sol";
import "../../../../infrastructure/value-interpreter/ValueInterpreter.sol";
import "../IExternalPositionParser.sol";
import "./ICompoundDebtPosition.sol";

pragma solidity 0.6.12;

/// @title CompoundDebtPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Compound Debt Positions
contract CompoundDebtPositionParser is IExternalPositionParser {
    address private immutable COMP_TOKEN;
    address private immutable COMPOUND_PRICE_FEED;
    address private immutable VALUE_INTERPRETER;

    constructor(
        address _compoundPriceFeed,
        address _compToken,
        address _valueInterpreter
    ) public {
        COMPOUND_PRICE_FEED = _compoundPriceFeed;
        COMP_TOKEN = _compToken;
        VALUE_INTERPRETER = _valueInterpreter;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transfered from the Vault
    /// @return amountsToTransfer_ The amounts to be transfered from the Vault
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
        (
            address[] memory assets,
            uint256[] memory amounts,
            bytes memory data
        ) = __decodeEncodedActionArgs(_encodedActionArgs);

        __validateActionData(_actionId, assets, data);

        if (
            _actionId == uint256(ICompoundDebtPosition.ExternalPositionActions.AddCollateral) ||
            _actionId == uint256(ICompoundDebtPosition.ExternalPositionActions.RepayBorrow)
        ) {
            assetsToTransfer_ = assets;
            amountsToTransfer_ = amounts;
        } else if (
            _actionId == uint256(ICompoundDebtPosition.ExternalPositionActions.Borrow) ||
            _actionId == uint256(ICompoundDebtPosition.ExternalPositionActions.RemoveCollateral)
        ) {
            assetsToReceive_ = assets;
        } else if (_actionId == uint256(ICompoundDebtPosition.ExternalPositionActions.ClaimComp)) {
            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = getCompToken();
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

    /// @dev Helper to decode action args
    function __decodeEncodedActionArgs(bytes memory _encodeActionArgs)
        private
        pure
        returns (
            address[] memory assets_,
            uint256[] memory amounts_,
            bytes memory data_
        )
    {
        (assets_, amounts_, data_) = abi.decode(_encodeActionArgs, (address[], uint256[], bytes));

        return (assets_, amounts_, data_);
    }

    /// @dev Runs validations before running a callOnExternalPosition.
    function __validateActionData(
        uint256 _actionId,
        address[] memory _assets,
        bytes memory _data
    ) private view {
        // Borrow and RepayBorrow actions make use of cTokens, that also need to be validated
        if (_actionId == uint256(ICompoundDebtPosition.ExternalPositionActions.Borrow)) {
            for (uint256 i; i < _assets.length; i++) {
                require(
                    IValueInterpreter(getValueInterpreter()).isSupportedAsset(_assets[i]),
                    "__validateActionData: Unsupported asset"
                );
            }
            __validateCTokens(abi.decode(_data, (address[])), _assets);
        } else if (
            _actionId == uint256(ICompoundDebtPosition.ExternalPositionActions.RepayBorrow)
        ) {
            __validateCTokens(abi.decode(_data, (address[])), _assets);
        }
    }

    /// @dev Validates a set of cTokens and the underlying tokens
    function __validateCTokens(address[] memory _cTokens, address[] memory _tokens) private view {
        require(
            _cTokens.length == _tokens.length,
            "__validateCTokens: Unequal assets and cTokens length"
        );

        for (uint256 i; i < _cTokens.length; i++) {
            require(
                CompoundPriceFeed(getCompoundPriceFeed()).getTokenFromCToken(_cTokens[i]) ==
                    _tokens[i],
                "__validateCTokens: Bad token cToken pair"
            );
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `COMPOUND_PRICE_FEED` variable
    /// @return compoundPriceFeed_ The `COMPOUND_PRICE_FEED` variable value
    function getCompoundPriceFeed() public view returns (address compoundPriceFeed_) {
        return COMPOUND_PRICE_FEED;
    }

    /// @notice Gets the `COMP_TOKEN` variable
    /// @return compToken_ The `COMP_TOKEN` variable value
    function getCompToken() public view returns (address compToken_) {
        return COMP_TOKEN;
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}
