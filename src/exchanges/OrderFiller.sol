pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../dependencies/DSMath.sol";
import "../dependencies/token/IERC20.sol";
import "../fund/accounting/IAccounting.sol";
import "../fund/trading/ITrading.sol";

/// @title Order Filler
/// @author Melonport AG <team@melonport.com>
contract OrderFiller is DSMath {
    event OrderFilled(
        address indexed exchangeAddress,
        address targetAsset,
        uint256 targetAmount,
        address offerAsset,
        uint256 offerAmount,
        address[] feeAssets,
        uint256[] feeAmounts
    );

    // TODO: modifier to assert that param array lengths are equal
    // modifier hasEqualArrayLengths

    // address _targetExchange = exchange where order filled (only needed for event emission)
    // @param _assets[0] = buy asset
    // @param _assets[1] = sell asset
    // @param _assets[2:end] = fee assets
    // @param _expectedAmounts[0] = expected received buy asset amount
    // @param _expectedAmounts[1] = expected spent sell asset amount
    // @param _expectedAmounts[2:end] = expected spent fee asset amounts
    modifier validateAndFinalizeFilledOrder(
        address _targetExchange,
        address[] memory _assets,
        uint256[] memory _expectedAmounts
    )
    {
        validateFillOrderInputs(_targetExchange, _assets, _expectedAmounts);

        (
            address[] memory cleanedAssets,
            uint256[] memory cleanedExpectedAmounts
        ) = formatFillOrderInputs(_assets, _expectedAmounts);

        uint256[] memory preFillBalances = getERC20BalancesOf(cleanedAssets);

        _;

        uint256[] memory balanceDiffs = calculateFillOrderBalanceDiffs(
            cleanedAssets,
            preFillBalances
        );

        validateAndEmitOrderFillResults(
            _targetExchange,
            cleanedAssets,
            cleanedExpectedAmounts,
            balanceDiffs
        );

        updateFillOrderAssetBalances(cleanedAssets, balanceDiffs);

        // TODO: revoke extra approval amounts?
    }

    // INTERNAL FUNCTIONS

    function calculateExpectedFillAmount(
        uint256 orderQuantity1,
        uint256 orderQuantity2,
        uint256 fillAmount1
    )
        internal
        pure
        returns (uint256)
    {
        return mul(fillAmount1, orderQuantity2) / orderQuantity1;
    }

    // PRIVATE FUNCTIONS

    function calculateFillOrderBalanceDiffs(
        address[] memory _assets,
        uint256[] memory _preFillBalances
    )
        private
        view
        returns (uint256[] memory)
    {
        assert(_assets.length == _preFillBalances.length);

        uint256[] memory balanceDiffs = new uint256[](_assets.length);
        for (uint256 i = 0; i < _assets.length; i++) {
            uint256 assetBalance = IERC20(_assets[i]).balanceOf(address(this));

            // Buy asset
            if (i == 0) {
                require(
                    assetBalance > _preFillBalances[i],
                    "calculateFillOrderBalanceDiffs: did not receive more of buy asset"
                );
                balanceDiffs[i] = sub(assetBalance, _preFillBalances[i]);
            }

            // Sell asset
            // TODO: technically, we don't need to require that funds decrease in the sell asset,
            // but it probably means there is an error at this stage, and it makes calcs simpler.
            else if (i == 1) {
                require(
                    assetBalance < _preFillBalances[i],
                    "calculateFillOrderBalanceDiffs: did not spend any sell asset"
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
        assert(_assets.length == balanceDiffs.length);
        return balanceDiffs;
    }

    function formatFillOrderInputs(
        address[] memory _assets,
        uint256[] memory _expectedAmounts
    )
        private
        pure
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

    function getERC20BalancesOf(address[] memory _assets)
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

    function updateFillOrderAssetBalances(
        address[] memory _assets,
        uint256[] memory _balanceDiffs
    )
        private
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

    function validateAndEmitOrderFillResults(
        address _targetExchange,
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
            // If sell asset, subtract the fee to the buy balance diff
            else if (_assets[i] == _assets[1]) {
                sellAmountFilled = sub(sellAmountFilled, _expectedAmounts[i]);
                feeAmountsFilled[i-feeOffset] = _expectedAmounts[i];
            }
            else {
                // Fee asset check
                require(
                    _balanceDiffs[i] <= _expectedAmounts[i],
                    "validateAndEmitOrderFillResults: fee higher than expected"
                );
                feeAmountsFilled[i-feeOffset] = _balanceDiffs[i];
            }
        }

        // Buy asset checks
        require(
            buyAmountFilled >= _expectedAmounts[0],
            "validateAndEmitOrderFillResults: received less buy asset than expected"
        );

        // Sell asset checks
        require(
            sellAmountFilled <= _expectedAmounts[1],
            "validateAndEmitOrderFillResults: spent more sell asset than expected"
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

    function validateFillOrderInputs(
        address _targetExchange,
        address[] memory _assets,
        uint256[] memory _expectedAmounts
    )
        private
        pure
        returns (address[] memory, uint256[] memory)
    {
        require(
            _targetExchange != address(0),
            "validateFillOrderInputs: targetExchange cannot be empty"
        );
        require(
            _assets.length == _expectedAmounts.length,
            "validateFillOrderInputs: array lengths not equal"
        );
        require(
            _assets[0] != _assets[1],
            "validateFillOrderInputs: buy and sell asset cannot be the same"
        );
    }
}
