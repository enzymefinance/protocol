// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../../../../interfaces/ICERC20.sol";
import "../../../utils/DispatcherOwnerMixin.sol";
import "../IDerivativePriceFeed.sol";

/// @title CompoundPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Compound Tokens (cTokens)
contract CompoundPriceFeed is IDerivativePriceFeed, DispatcherOwnerMixin {
    event CTokenAdded(address indexed cToken, address indexed token);

    mapping(address => address) private cTokenToToken;

    constructor(
        address _dispatcher,
        address _weth,
        address _ceth,
        address[] memory cERC20Tokens
    ) public DispatcherOwnerMixin(_dispatcher) {
        // Set cEth
        cTokenToToken[_ceth] = _weth;
        emit CTokenAdded(_ceth, _weth);

        // Set any other cTokens
        if (cERC20Tokens.length > 0) {
            __addCERC20Tokens(cERC20Tokens);
        }
    }

    /// @notice Gets the rates for 1 unit of the derivative to its underlying assets
    /// @param _derivative The derivative for which to get the rates
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return rates_ The rates for the _derivative to the underlyings_
    function getRatesToUnderlyings(address _derivative)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory rates_)
    {
        underlyings_ = new address[](1);
        underlyings_[0] = cTokenToToken[_derivative];
        require(underlyings_[0] != address(0), "getRatesToUnderlyings: Unsupported derivative");

        rates_ = new uint256[](1);
        // Returns a value with 10^18 precision
        rates_[0] = ICERC20(_derivative).exchangeRateStored();

        return (underlyings_, rates_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) external view override returns (bool isSupported_) {
        return cTokenToToken[_asset] != address(0);
    }

    //////////////////////
    // CTOKENS REGISTRY //
    //////////////////////

    /// @notice Adds cTokens to the price feed
    /// @param _cTokens cTokens to add
    /// @dev Only allows CERC20 tokens. CEther is set in the constructor.
    function addCTokens(address[] calldata _cTokens) external onlyDispatcherOwner {
        __addCERC20Tokens(_cTokens);
    }

    /// @dev Helper to add cTokens
    function __addCERC20Tokens(address[] memory _cTokens) private {
        require(_cTokens.length > 0, "__addCTokens: Empty _cTokens");

        for (uint256 i; i < _cTokens.length; i++) {
            require(cTokenToToken[_cTokens[i]] == address(0), "__addCTokens: Value already set");

            address token = ICERC20(_cTokens[i]).underlying();
            cTokenToToken[_cTokens[i]] = token;

            emit CTokenAdded(_cTokens[i], token);
        }
    }

    ////////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Returns the underlying asset of a given cToken
    /// @param _cToken The cToken for which to get the underlying asset
    /// @return token_ The underlying token
    function getTokenFromCToken(address _cToken) public view returns (address token_) {
        return cTokenToToken[_cToken];
    }
}
