// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../interfaces/ISynthetixAddressResolver.sol";
import "../../interfaces/ISynthetixExchanger.sol";
import "../../utils/FundDeployerOwnerMixin.sol";
import "../price-feeds/derivatives/feeds/SynthetixPriceFeed.sol";
import "./IAssetFinalityResolver.sol";

/// @title AssetFinalityResolver Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract that helps achieve asset finality
contract AssetFinalityResolver is IAssetFinalityResolver, FundDeployerOwnerMixin {
    event SynthetixPriceFeedSet(address nextSynthetixPriceFeed);

    address private immutable SYNTHETIX_ADDRESS_RESOLVER;

    address private synthetixPriceFeed;

    constructor(
        address _fundDeployer,
        address _synthetixPriceFeed,
        address _synthetixAddressResolver
    ) public FundDeployerOwnerMixin(_fundDeployer) {
        SYNTHETIX_ADDRESS_RESOLVER = _synthetixAddressResolver;
        __setSynthetixPriceFeed(_synthetixPriceFeed);
    }

    /// @notice Helper to finalize asset balances according to the procedures of their protocols
    /// @param _target The account that the assets belong to
    /// @param _assets The assets to finalize
    /// @dev Currently only handles Synths, and uses the SynthetixPriceFeed as a shortcut
    /// to validate supported Synths
    function finalizeAssets(address _target, address[] memory _assets) external override {
        if (_assets.length == 0) {
            return;
        }

        bytes32[] memory currencyKeys = SynthetixPriceFeed(synthetixPriceFeed)
            .getCurrencyKeysForSynths(_assets);
        address synthetixExchanger;
        for (uint256 i; i < _assets.length; i++) {
            if (currencyKeys[i] != 0) {
                if (synthetixExchanger == address(0)) {
                    synthetixExchanger = ISynthetixAddressResolver(SYNTHETIX_ADDRESS_RESOLVER)
                        .requireAndGetAddress(
                        "Exchanger",
                        "finalizeAssets: Missing Synthetix Exchanger"
                    );
                }
                ISynthetixExchanger(synthetixExchanger).settle(_target, currencyKeys[i]);
            }
        }
    }

    /// @notice Sets a new SynthetixPriceFeed for use within the contract
    /// @param _nextSynthetixPriceFeed The address of the SynthetixPriceFeed contract
    function setSynthetixPriceFeed(address _nextSynthetixPriceFeed)
        external
        onlyFundDeployerOwner
    {
        __setSynthetixPriceFeed(_nextSynthetixPriceFeed);
    }

    /// @dev Helper to set the synthetixPriceFeed
    function __setSynthetixPriceFeed(address _nextSynthetixPriceFeed) private {
        // Validates that the next SynthetixPriceFeed implements the required function
        SynthetixPriceFeed(_nextSynthetixPriceFeed).getCurrencyKeysForSynths(new address[](0));

        synthetixPriceFeed = _nextSynthetixPriceFeed;

        emit SynthetixPriceFeedSet(_nextSynthetixPriceFeed);
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

    /// @notice Gets the `synthetixPriceFeed` variable
    /// @return synthetixPriceFeed_ The `synthetixPriceFeed` variable value
    function getSynthetixPriceFeed() external view returns (address synthetixPriceFeed_) {
        return synthetixPriceFeed;
    }
}
