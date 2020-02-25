pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../../dependencies/DSMath.sol";
import "../../dependencies/token/IERC20.sol";
import "../../fund/accounting/IAccounting.sol";
import "../../fund/trading/ITrading.sol";

/// @title Order Filler base contract
/// @author Melonport AG <team@melonport.com>
abstract contract OrderFiller is DSMath {
    event OrderFilled(
        address indexed exchangeAddress,
        address buyAsset,
        uint256 buyAmount,
        address sellAsset,
        uint256 sellAmount,
        address[] feeAssets,
        uint256[] feeAmounts
    );

    modifier equalArrayLengths(
        address[] memory _addresses,
        uint256[] memory _amounts)
    {
        require(
            __arraysAreEqualLength(_addresses, _amounts),
            "equalArrayLengths: unequal array lengths"
        );
        _;
    }

    /// @notice Wraps an on-chain order execution to validate received values,
    /// update fund asset ammounts, and emit an event
    /// @param _targetExchange Exchange where order filled (only needed for event emission)
    /// @param _assets[0] Buy asset
    /// @param _assets[1] Sell asset
    /// @param _assets[2:end] Fee assets
    /// @param _expectedAmounts[0] Expected received buy asset amount
    /// @param _expectedAmounts[1] Expected spent sell asset amount
    /// @param _expectedAmounts[2:end] Expected spent fee asset amounts
    modifier validateAndFinalizeFilledOrder(
        address _targetExchange,
        address[] memory _assets,
        uint256[] memory _expectedAmounts
    )
    {
        __validateFillOrderInputs(_targetExchange, _assets, _expectedAmounts);

        (
            address[] memory formatedAssets,
            uint256[] memory formatedExpectedAmounts
        ) = __formatFillOrderInputs(_assets, _expectedAmounts);

        uint256[] memory preFillBalances = __getFundERC20BalanceOfValues(formatedAssets);

        _;

        uint256[] memory balanceDiffs = __calculateFillOrderBalanceDiffs(
            formatedAssets,
            preFillBalances
        );

        __validateAndEmitOrderFillResults(
            _targetExchange,
            formatedAssets,
            formatedExpectedAmounts,
            balanceDiffs
        );

        __updateFillOrderAssetBalances(formatedAssets, balanceDiffs);

        // TODO: revoke extra approval amounts?
    }

    // PRIVATE FUNCTIONS

    function __arraysAreEqualLength(
        address[] memory _addresses,
        uint256[] memory _amounts
    )
        private
        pure
        returns (bool)
    {
        return _addresses.length == _amounts.length;
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
        equalArrayLengths(_assets, _preFillBalances)
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

    /// @notice Formats the _assets and _expectedAmounts provided by an exchange adapter
    /// for use by validateAndFinalizeFilledOrder
    /// @dev At present, this is only used to aggregate multiple fees of the same asset
    /// e.g., in 0x v3, if the takerFee asset is WETH, then takerFee and protocolFee are aggregated
    /// @param _assets The raw assets of the fill order, passed by the exchange adapter
    /// @param _expectedAmounts The raw expected fill amounts for _assets, passed by the exchange adapter
    /// @return The formatted asset array (no duplicate fee assets)
    /// @return The formatted expected fill amounts array (duplicate fee assets aggregated)
    function __formatFillOrderInputs(
        address[] memory _assets,
        uint256[] memory _expectedAmounts
    )
        private
        pure
        equalArrayLengths(_assets, _expectedAmounts)
        returns (address[] memory, uint256[] memory)
    {
        uint256 feeOffset = 2;
        uint256 cleanedAssetsLength = feeOffset;
        for (uint256 i = feeOffset; i < _assets.length; i++) {
            if (_assets[i] == address(0) || _expectedAmounts[i] == 0) continue;

            // If only 1 fee asset, just check if 0 value
            if (_assets.length == feeOffset + 1) {
                cleanedAssetsLength++;
            }
            else {
                bool feeAssetAdded;
                for (uint256 j = feeOffset; j < i; j++) {
                    if (_assets[i] == _assets[j]) {
                        feeAssetAdded = true;
                        break;
                    }
                }
                if (!feeAssetAdded) cleanedAssetsLength++;
            }
        }

        address[] memory cleanedAssets = new address[](cleanedAssetsLength);
        uint256[] memory cleanedExpectedAmounts = new uint256[](cleanedAssetsLength);
        cleanedAssets[0] = _assets[0];
        cleanedAssets[1] = _assets[1];
        cleanedExpectedAmounts[0] = _expectedAmounts[0];
        cleanedExpectedAmounts[1] = _expectedAmounts[1];

        for (uint256 i = feeOffset; i < _assets.length; i++) {
            if (_assets[i] == address(0) || _expectedAmounts[i] == 0) continue;

            // If only 1 fee asset, just add it
            if (_assets.length == feeOffset + 1) {
                cleanedAssets[i] = _assets[i];
                cleanedExpectedAmounts[i] = _expectedAmounts[i];
            }
            else {
                for (uint256 j = feeOffset; j < cleanedAssetsLength; j++) {
                    // If asset slot is empty, just add it
                    if (cleanedAssets[j] == address(0)) {
                        cleanedAssets[j] = _assets[i];
                        cleanedExpectedAmounts[j] = _expectedAmounts[i];
                        break;
                    }
                    // If asset has already been added, aggregate the values
                    else if (_assets[i] == cleanedAssets[j]) {
                        cleanedAssets[j] = _assets[i];
                        cleanedExpectedAmounts[j] = add(
                            cleanedExpectedAmounts[j],
                            _expectedAmounts[i]
                        );
                        break;
                    }
                }
            }
        }
        return (cleanedAssets, cleanedExpectedAmounts);
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

    /// @notice Updates a fund's assetBalances, for a list of assets
    /// @dev This function assumes that _assets[0] should always be added, 
    /// and that _assets[1:end] should always be subtracted. We could also pass a _balanceDiffSign
    /// @dev __formatFillOrderInputs will have already set _balanceDiffs to 0 for duplicate assets
    /// @param _assets The assets to update
    /// @param _balanceDiffs The differences in pre- and post-fill balanceOf _assets, for the fund
    function __updateFillOrderAssetBalances(
        address[] memory _assets,
        uint256[] memory _balanceDiffs
    )
        private
        equalArrayLengths(_assets, _balanceDiffs)
    {
        IAccounting accounting = IAccounting(ITrading(payable(address(this))).routes().accounting);

        accounting.increaseAssetBalance(_assets[0], _balanceDiffs[0]);
        accounting.decreaseAssetBalance(_assets[1], _balanceDiffs[1]);

        for (uint256 i = 2; i < _assets.length; i++) {
            if (_assets[i] != _assets[0] && _assets[i] != _assets[1]) {
                accounting.decreaseAssetBalance(_assets[i], _balanceDiffs[i]);
            }
        }
    }

    /// @notice Validates the spent/received amounts from the fill, and emits an OrderFill event
    /// @dev Since a fee asset can be the same as a buy/sell asset,
    /// this takes that into account in calculating the actual fill amounts
    /// @param _targetExchange The exchange address where the fill was executed
    /// @param _assets The assets that were filled
    /// @param _expectedAmounts The expected fill amounts of _assets
    /// @param _balanceDiffs The differences in pre- and post-fill balanceOf of _assets, for the fund
    function __validateAndEmitOrderFillResults(
        address _targetExchange,
        address[] memory _assets,
        uint256[] memory _expectedAmounts,
        uint256[] memory _balanceDiffs
    )
        private
        equalArrayLengths(_assets, _expectedAmounts)
        equalArrayLengths(_assets, _balanceDiffs)
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
            _targetExchange,
            _assets[0],
            buyAmountFilled,
            _assets[1],
            sellAmountFilled,
            feeAssets,
            feeAmountsFilled
        );
    }

    /// @notice Validates the args passed by an exchange adapter
    /// @param _targetExchange The exchange address where the fill will be executed
    /// @param _assets The assets to be filled
    /// @param _expectedAmounts The expected fill amounts of _assets
    function __validateFillOrderInputs(
        address _targetExchange,
        address[] memory _assets,
        uint256[] memory _expectedAmounts
    )
        private
        pure
    {
        require(
            _targetExchange != address(0),
            "__validateFillOrderInputs: targetExchange cannot be empty"
        );
        require(
            __arraysAreEqualLength(_assets, _expectedAmounts),
            "__validateFillOrderInputs: array lengths not equal"
        );
        require(
            _assets[0] != _assets[1],
            "__validateFillOrderInputs: buy and sell asset cannot be the same"
        );
    }
}
