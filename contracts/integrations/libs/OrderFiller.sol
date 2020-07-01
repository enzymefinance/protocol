// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "./IntegrationAdapter.sol";
import "../../dependencies/DSMath.sol";
import "../../dependencies/token/IERC20.sol";
import "../../fund/vault/IVault.sol";

/// @title OrderFiller Base Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Base contract for standardizing the filled amounts of assets
abstract contract OrderFiller is DSMath, IntegrationAdapter {
    event OrderFilled(
        address buyAsset,
        uint256 buyAmount,
        address sellAsset,
        uint256 sellAmount,
        address[] feeAssets,
        uint256[] feeAmounts
    );

    /// @notice Wraps an on-chain order execution to validate received values,
    /// update fund asset ammounts, and emit an event
    /// @param _fillData Encoded data used by the OrderFiller
    modifier validateAndFinalizeFilledOrder(bytes memory _fillData) {
        // Validate params
        __validateFillOrderInputs(_fillData);

        // Approve ERC20s to-be-filled, storing original allowances
        // @dev Don't use aggregated fill data for this step, as we need targets for approvals
        uint256[] memory originalAllowances = __approveFillOrderAssets(_fillData);

        // Parse _fillData by filtering out empty/invalid fees and aggregating duplicate ones
        (
            address[] memory aggregatedAssets,
            uint256[] memory aggregatedExpectedAmounts
        ) = __parseAggregatedFillDataValues(_fillData);

        // Get the fund's ERC20 balanceOf amounts pre-fill
        uint256[] memory preFillBalances = __getFundERC20BalanceOfValues(aggregatedAssets);

        _;

        // Calculate the diffs between the fund's pre- and post-fill balanceOf amounts
        uint256[] memory balanceDiffs = __calculateFillOrderBalanceDiffs(
            aggregatedAssets,
            preFillBalances
        );

        // Validate whether the actual fill amounts are at least as beneficial for the fund as the expected amounts
        // Emit event in this step with the actual fill amounts for each asset
        __validateAndEmitOrderFillResults(
            aggregatedAssets,
            aggregatedExpectedAmounts,
            balanceDiffs
        );

        // Revoke excess ERC20 allowances, if necessary
        // @dev Don't use aggregated fill data for this step, as we need targets for approvals
        __resetFillOrderAssetAllowances(originalAllowances, _fillData);
    }

    // INTERNAL FUNCTIONS

    /// @notice Decodes the encoded data used by the OrderFiller
    /// @param _fillData Encoded data used by the OrderFiller
    /// @return _assets Assets to be filled
    /// - [0] Buy asset
    /// - [1] Sell asset
    /// - [2:end] Fee assets
    /// @return _expectedAmounts Expected amounts of assets to be filled
    /// - [0] Expected received buy asset amount
    /// - [1] Expected spent sell asset amount
    /// - [2:end] Expected spent fee asset amounts
    /// @return _approvalTargets The approve() targets for assets to be filled
    /// - [0] The fund
    /// - [1] The approve() target for the sell asset
    /// - [2:end] The approve() targets for fee assets
    function __decodeOrderFillData(bytes memory _fillData)
        internal
        pure
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        return abi.decode(_fillData, (address[], uint256[], address[]));
    }

    /// @notice Encodes the data used by the OrderFiller
    /// @param _assets[0] Buy asset
    /// @param _assets[1] Sell asset
    /// @param _assets[2:end] Fee assets
    /// @param _expectedAmounts[0] Expected received buy asset amount
    /// @param _expectedAmounts[1] Expected spent sell asset amount
    /// @param _expectedAmounts[2:end] Expected spent fee asset amounts
    /// @param _approvalTargets[0] The fund
    /// @param _approvalTargets[1] The approve() target for the sell asset
    /// @param _approvalTargets[2:end] The approve() targets for fee assets
    function __encodeOrderFillData(
        address[] memory _assets,
        uint256[] memory _expectedAmounts,
        address[] memory _approvalTargets
    )
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(_assets, _expectedAmounts, _approvalTargets);
    }

    // PRIVATE FUNCTIONS

    /// @notice Approves allowances of sell and fee assets in the order fill
    /// @param _fillData Encoded data used by the OrderFiller
    /// @return originalAllowances_ The original allowances for the assets involved in the fill
    function __approveFillOrderAssets(bytes memory _fillData) private returns (uint256[] memory) {
        (
            address[] memory assets,
            uint256[] memory expectedAmounts,
            address[] memory approvalTargets
        ) = __decodeOrderFillData(_fillData);

        uint256[] memory originalAllowances = new uint256[](assets.length);

        // Skip first asset, as the "buy" side is always the fund
        for (uint i = 1; i < assets.length; i++) {
            string memory fillAssetType = i == 1 ? "sell asset" : "fee asset";
            if (__approvalParamsAreValid(assets[i], approvalTargets[i], expectedAmounts[i])) {
                __approveAsset(
                    assets[i],
                    approvalTargets[i],
                    expectedAmounts[i],
                    fillAssetType
                );
            }
        }

        return originalAllowances;
    }

    /// @notice Helper to confirm whether the params for an ERC20 approval are valid
    function __approvalParamsAreValid(address _asset, address _target, uint256 _amount)
        private
        pure
        returns (bool)
    {
        return _asset != address(0) && _amount > 0 && _target != address(0);
    }

    /// @notice Calculates the differences in a fund's asset balances before and after an order fill
    /// @dev Fee assets that are the same as a buy/sell asset are given a diff of 0 to ensure
    /// that they are only added/subtracted once from a fund's asset balance
    /// @param _assets The assets for which to check balances
    /// @param _preFillBalances The balances of _assets prior to the fill
    /// @return The balances of _assets subsequent to the fill
    function __calculateFillOrderBalanceDiffs(
        address[] memory _assets,
        uint256[] memory _preFillBalances
    )
        private
        view
        returns (uint256[] memory)
    {
        uint256[] memory balanceDiffs = new uint256[](_assets.length);
        for (uint256 i = 0; i < _assets.length; i++) {
            uint256 assetBalance = IERC20(_assets[i]).balanceOf(address(this));

            // Buy asset
            if (i == 0) {
                require(
                    assetBalance > _preFillBalances[i],
                    "__calculateFillOrderBalanceDiffs: did not receive more of buy asset"
                );
                balanceDiffs[i] = sub(assetBalance, _preFillBalances[i]);
            }

            // Sell asset
            // TODO: technically, we don't need to require that funds decrease in the sell asset,
            // but it probably means there is an error at this stage, and it makes calcs simpler.
            else if (i == 1) {
                require(
                    assetBalance < _preFillBalances[i],
                    "__calculateFillOrderBalanceDiffs: did not spend any sell asset"
                );
                balanceDiffs[i] = sub(_preFillBalances[i], assetBalance);
            }

            // Fee assets
            else {
                // set balance to 0 if fee asset is same as buy or sell asset
                if (_assets[i] == _assets[0] || _assets[i] == _assets[1]) balanceDiffs[i] = 0;
                else balanceDiffs[i] = sub(_preFillBalances[i], assetBalance);
            }
        }
        return balanceDiffs;
    }

    /// @notice Gets the ERC20 balanceOf for a fund contract, for a list of assets
    /// @dev We use this separate function to avoid adding to the memory variable stack
    /// in validateAndFinalizeFilledOrder
    /// @param _assets The assets to get balanceOf
    /// @return The current balanceOf values
    function __getFundERC20BalanceOfValues(address[] memory _assets)
        private
        view
        returns (uint256[] memory)
    {
        uint256[] memory balances = new uint256[](_assets.length);
        for (uint256 i = 0; i < _assets.length; i++) {
            balances[i] = IERC20(_assets[i]).balanceOf(address(this));
        }
        return balances;
    }

    /// @notice Formats the _assets and _expectedAmounts provided by an integration adapter
    /// for use by validateAndFinalizeFilledOrder
    /// @dev At present, this is only used to aggregate multiple fees of the same asset
    /// e.g., in 0x v3, if the takerFee asset is WETH, then takerFee and protocolFee are aggregated
    /// @param _fillData Encoded data used by the OrderFiller
    /// @return aggregatedAssets_ The formatted asset array (no duplicate fee assets)
    /// @return aggregatedExpectedAmounts_ The formatted expected fill amounts array (duplicate fee assets aggregated)
    function __parseAggregatedFillDataValues(
        bytes memory _fillData
    )
        private
        pure
        returns (address[] memory, uint256[] memory)
    {
        (
            address[] memory assets,
            uint256[] memory expectedAmounts,
        ) = __decodeOrderFillData(_fillData);

        uint256 feeOffset = 2;
        uint256 cleanedAssetsLength = feeOffset;

        // Filter out assets with a 0 address, 0 expected amount
        // Filter out fee assets that have already been added
        for (uint256 i = feeOffset; i < assets.length; i++) {
            if (assets[i] == address(0) || expectedAmounts[i] == 0) continue;

            // If only 1 fee asset, just check if 0 value
            if (assets.length == feeOffset + 1) {
                cleanedAssetsLength++;
            }
            else {
                bool feeAssetAdded;
                for (uint256 j = feeOffset; j < i; j++) {
                    if (assets[i] == assets[j]) {
                        feeAssetAdded = true;
                        break;
                    }
                }
                if (!feeAssetAdded) cleanedAssetsLength++;
            }
        }

        address[] memory cleanedAssets = new address[](cleanedAssetsLength);
        uint256[] memory cleanedExpectedAmounts = new uint256[](cleanedAssetsLength);
        cleanedAssets[0] = assets[0];
        cleanedAssets[1] = assets[1];
        cleanedExpectedAmounts[0] = expectedAmounts[0];
        cleanedExpectedAmounts[1] = expectedAmounts[1];

        for (uint256 i = feeOffset; i < assets.length; i++) {
            if (assets[i] == address(0) || expectedAmounts[i] == 0) continue;

            // If only 1 fee asset, just add it
            if (assets.length == feeOffset + 1) {
                cleanedAssets[i] = assets[i];
                cleanedExpectedAmounts[i] = expectedAmounts[i];
            }
            else {
                for (uint256 j = feeOffset; j < cleanedAssetsLength; j++) {
                    // If asset slot is empty, just add it
                    if (cleanedAssets[j] == address(0)) {
                        cleanedAssets[j] = assets[i];
                        cleanedExpectedAmounts[j] = expectedAmounts[i];
                        break;
                    }
                    // If asset has already been added, aggregate the values
                    else if (assets[i] == cleanedAssets[j]) {
                        cleanedAssets[j] = assets[i];
                        cleanedExpectedAmounts[j] = add(
                            cleanedExpectedAmounts[j],
                            expectedAmounts[i]
                        );
                        break;
                    }
                }
            }
        }
        return (cleanedAssets, cleanedExpectedAmounts);
    }

    /// @notice Resets allowances of sell and fee assets in the order fill to their original values
    /// @param _originalAllowances The original allowances (pre-approval) for assets in the order fill
    /// @param _fillData Encoded data used by the OrderFiller
    function __resetFillOrderAssetAllowances(
        uint256[] memory _originalAllowances,
        bytes memory _fillData
    )
        private
    {
        (
            address[] memory assets,
            uint256[] memory expectedAmounts,
            address[] memory approvalTargets
        ) = __decodeOrderFillData(_fillData);

        // Skip first asset, as the "buy" side is always the fund
        for (uint i = 1; i < assets.length; i++) {
            // Same as __approveFillOrderAssets, but also check current vs original allowance
            if (
                __approvalParamsAreValid(assets[i], approvalTargets[i], expectedAmounts[i]) &&
                IERC20(assets[i]).allowance(
                    address(this),
                    approvalTargets[i]
                ) != _originalAllowances[i]
            )
            {
                IERC20(assets[i]).approve(approvalTargets[i], _originalAllowances[i]);
            }
        }
    }

    /// @notice Validates the spent/received amounts from the fill, and emits an OrderFill event
    /// @dev Since a fee asset can be the same as a buy/sell asset,
    /// this takes that into account in calculating the actual fill amounts
    /// @param _assets The assets that were filled
    /// @param _expectedAmounts The expected fill amounts of _assets
    /// @param _balanceDiffs The differences in pre- and post-fill balanceOf of _assets, for the fund
    function __validateAndEmitOrderFillResults(
        address[] memory _assets,
        uint256[] memory _expectedAmounts,
        uint256[] memory _balanceDiffs
    )
        private
    {
        uint256 buyAmountFilled = _balanceDiffs[0];
        uint256 sellAmountFilled = _balanceDiffs[1];
        address[] memory feeAssets = new address[](_assets.length - 2);
        uint256[] memory feeAmountsFilled = new uint256[](_assets.length - 2);

        uint256 feeOffset = 2;
        for (uint256 i = feeOffset; i < _assets.length; i++) {
            feeAssets[i-feeOffset] = _assets[i];
            // If buy asset, add the fee to the buy balance diff
            if (_assets[i] == _assets[0]) {
                buyAmountFilled = add(buyAmountFilled, _expectedAmounts[i]);
                feeAmountsFilled[i-feeOffset] = _expectedAmounts[i];
            }
            // If sell asset, subtract the fee from the sell balance diff
            else if (_assets[i] == _assets[1]) {
                sellAmountFilled = sub(sellAmountFilled, _expectedAmounts[i]);
                feeAmountsFilled[i-feeOffset] = _expectedAmounts[i];
            }
            else {
                // Fee asset check
                require(
                    _balanceDiffs[i] <= _expectedAmounts[i],
                    "__validateAndEmitOrderFillResults: fee higher than expected"
                );
                feeAmountsFilled[i-feeOffset] = _balanceDiffs[i];
            }
        }

        // Buy asset checks
        require(
            buyAmountFilled >= _expectedAmounts[0],
            "__validateAndEmitOrderFillResults: received less buy asset than expected"
        );

        // Sell asset checks
        require(
            sellAmountFilled <= _expectedAmounts[1],
            "__validateAndEmitOrderFillResults: spent more sell asset than expected"
        );

        emit OrderFilled(
            _assets[0],
            buyAmountFilled,
            _assets[1],
            sellAmountFilled,
            feeAssets,
            feeAmountsFilled
        );
    }

    /// @notice Validates the args passed by an integration adapter
    /// @param _fillData Encoded data used by the OrderFiller
    function __validateFillOrderInputs(bytes memory _fillData) private pure {
        (
            address[] memory assets,
            uint256[] memory expectedAmounts,
            address[] memory assetReceipients
        ) = __decodeOrderFillData(_fillData);
        require(
            assets.length == expectedAmounts.length,
            "__validateFillOrderInputs: assets and expectedAmounts lengths not equal"
        );
        require(
            assets.length == assetReceipients.length,
            "__validateFillOrderInputs: assets and assetReceipients lengths not equal"
        );
        require(
            assets[0] != assets[1],
            "__validateFillOrderInputs: buy and sell asset cannot be the same"
        );
    }
}
