// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./../../interfaces/ISynthetixExchanger.sol";
import "./../../../release/interfaces/ISynthetixExchangeRates.sol";

contract MockSynthetixExchanger is ISynthetixExchanger {
    using SafeMath for uint256;

    address public immutable EXCHANGE_RATES;
    uint256 public immutable FEE;
    uint256 public constant UNIT_FEE = 1000;

    constructor(address _exchangeRates, uint256 fee) public {
        EXCHANGE_RATES = _exchangeRates;
        FEE = fee;
    }

    function getAmountsForExchange(
        uint256 sourceAmount,
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey
    )
        external
        view
        override
        returns (
            uint256 amountReceived,
            uint256 fee,
            uint256 exchangeFeeRate
        )
    {
        ISynthetixExchangeRates exchangeRates = ISynthetixExchangeRates(EXCHANGE_RATES);

        (uint256 sourceRate, bool sourceRateIsInvalid) = exchangeRates.rateAndInvalid(
            sourceCurrencyKey
        );
        require(!sourceRateIsInvalid, "getAmountsForExchange: Source rate is invalid");

        (uint256 destinationRate, bool destinationRateIsInvalid) = exchangeRates.rateAndInvalid(
            destinationCurrencyKey
        );
        require(!destinationRateIsInvalid, "getAmountsForExchange: Destination rate is invalid");

        uint256 destinationAmount = sourceAmount.mul(sourceRate).div(destinationRate);

        exchangeFeeRate = FEE;
        amountReceived = destinationAmount.mul(UNIT_FEE.sub(exchangeFeeRate)).div(UNIT_FEE);
        fee = destinationAmount.sub(amountReceived);

        return (amountReceived, fee, exchangeFeeRate);
    }
}
