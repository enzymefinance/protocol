// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/ICERC20.sol";
import "../../../../utils/FundDeployerOwnerMixin.sol";
import "../IDerivativePriceFeed.sol";

/// @title CompoundPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Compound Tokens (cTokens)
contract CompoundPriceFeed is IDerivativePriceFeed, FundDeployerOwnerMixin {
    using SafeMath for uint256;

    event CTokenAdded(address indexed cToken, address indexed token);

    uint256 private constant CTOKEN_RATE_DIVISOR = 10**18;

    address private immutable WETH_TOKEN;

    mapping(address => address) private cTokenToToken;

    constructor(address _fundDeployer, address _weth)
        public
        FundDeployerOwnerMixin(_fundDeployer)
    {
        WETH_TOKEN = _weth;
    }

    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivative The derivative to convert
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    function calcUnderlyingValues(address _derivative, uint256 _derivativeAmount)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        underlyings_ = new address[](1);
        underlyings_[0] = cTokenToToken[_derivative];
        require(underlyings_[0] != address(0), "calcUnderlyingValues: Unsupported derivative");

        underlyingAmounts_ = new uint256[](1);
        // Returns a rate scaled to 10^18
        underlyingAmounts_[0] = _derivativeAmount
            .mul(ICERC20(_derivative).exchangeRateStored())
            .div(CTOKEN_RATE_DIVISOR);

        return (underlyings_, underlyingAmounts_);
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

    /// @notice Adds an array of cEtherTokens to the price feed
    /// @param _cEtherTokens cEthTokens to add
    function addCEtherTokens(address[] calldata _cEtherTokens) external onlyFundDeployerOwner {
        for (uint256 i; i < _cEtherTokens.length; i++) {
            require(
                cTokenToToken[_cEtherTokens[i]] == address(0),
                "addCEtherTokens: Value already set"
            );

            cTokenToToken[_cEtherTokens[i]] = getWethToken();

            emit CTokenAdded(_cEtherTokens[i], getWethToken());
        }
    }

    /// @notice Adds cTokens to the price feed
    /// @param _cTokens cTokens to add
    /// @dev Only allows CERC20 tokens.
    function addCTokens(address[] calldata _cTokens) external onlyFundDeployerOwner {
        require(_cTokens.length > 0, "addCTokens: Empty _cTokens");

        for (uint256 i; i < _cTokens.length; i++) {
            require(cTokenToToken[_cTokens[i]] == address(0), "addCTokens: Value already set");

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

    /// @notice Gets the `WETH_TOKEN` variable value
    /// @return wethToken_ The `WETH_TOKEN` value
    function getWethToken() public view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
