// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../interfaces/ISynthetixAddressResolver.sol";
import "../../interfaces/ISynthetixExchanger.sol";
import "../price-feeds/derivatives/feeds/SynthetixPriceFeed.sol";
import "./IAssetFinalityResolver.sol";

/// @title AssetFinalityResolver Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A contract that helps achieve asset finality
/// @dev Intended to be delegate-callable
contract AssetFinalityResolver is IAssetFinalityResolver {
    address internal immutable SYNTHETIX_ADDRESS_RESOLVER;
    address internal immutable SYNTHETIX_PRICE_FEED;

    constructor(address _synthetixPriceFeed, address _synthetixAddressResolver) public {
        SYNTHETIX_ADDRESS_RESOLVER = _synthetixAddressResolver;
        SYNTHETIX_PRICE_FEED = _synthetixPriceFeed;
    }

    /// @dev Helper to finalize an asset's balance at a given target address and return its balance
    function finalizeAndGetAssetBalance(
        address _target,
        address _asset,
        bool _requireFinality
    ) external override returns (uint256 assetBalance_) {
        bytes32 currencyKey = SynthetixPriceFeed(SYNTHETIX_PRICE_FEED).getCurrencyKeyForSynth(
            _asset
        );
        if (currencyKey != 0) {
            address synthetixExchanger = ISynthetixAddressResolver(SYNTHETIX_ADDRESS_RESOLVER)
                .requireAndGetAddress(
                "Exchanger",
                "finalizeAndGetAssetBalance: Missing Exchanger"
            );
            try ISynthetixExchanger(synthetixExchanger).settle(_target, currencyKey)  {} catch {
                require(!_requireFinality, "finalizeAndGetAssetBalance: Cannot settle Synth");
            }
        }

        return ERC20(_asset).balanceOf(_target);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `SYNTHETIX_ADDRESS_RESOLVER` variable
    /// @return synthetixAddressResolver_ The `SYNTHETIX_ADDRESS_RESOLVER` variable value
    function getSynthetixAddressResolver()
        external
        view
        returns (address synthetixAddressResolver_)
    {
        return SYNTHETIX_ADDRESS_RESOLVER;
    }

    /// @notice Gets the `SYNTHETIX_PRICE_FEED` variable
    /// @return synthetixPriceFeed_ The `SYNTHETIX_PRICE_FEED` variable value
    function getSynthetixPriceFeed() external view returns (address synthetixPriceFeed_) {
        return SYNTHETIX_PRICE_FEED;
    }
}
