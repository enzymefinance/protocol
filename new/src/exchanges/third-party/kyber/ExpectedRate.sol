pragma solidity ^0.4.21;

import "./KyberDependencies.sol";
import "./KyberNetwork.sol";

contract ExpectedRate is Withdrawable, ExpectedRateInterface, Utils {

    KyberNetwork public kyberNetwork;
    uint public quantityFactor = 2;
    uint public worstCaseRateFactorInBps = 50;

    function ExpectedRate(KyberNetwork _kyberNetwork, address _admin) public {
        require(_admin != address(0));
        require(_kyberNetwork != address(0));
        kyberNetwork = _kyberNetwork;
        admin = _admin;
    }

    event QuantityFactorSet (uint newFactor, uint oldFactor, address sender);

    function setQuantityFactor(uint newFactor) public onlyOperator {
        require(newFactor <= 100);

        QuantityFactorSet(newFactor, quantityFactor, msg.sender);
        quantityFactor = newFactor;
    }

    event MinSlippageFactorSet (uint newMin, uint oldMin, address sender);

    function setWorstCaseRateFactor(uint bps) public onlyOperator {
        require(bps <= 100 * 100);

        MinSlippageFactorSet(bps, worstCaseRateFactorInBps, msg.sender);
        worstCaseRateFactorInBps = bps;
    }

    //@dev when srcQty too small or 0 the expected rate will be calculated without quantity,
    // will enable rate reference before committing to any quantity
    //@dev when srcQty too small (no actual dest qty) slippage rate will be 0.
    function getExpectedRate(ERC20Clone src, ERC20Clone dest, uint srcQty)
        public view
        returns (uint expectedRate, uint slippageRate)
    {
        require(quantityFactor != 0);
        require(srcQty <= MAX_QTY);
        require(srcQty * quantityFactor <= MAX_QTY);

        if (srcQty == 0) srcQty = 1;

        uint bestReserve;
        uint worstCaseSlippageRate;

        (bestReserve, expectedRate) = kyberNetwork.findBestRate(src, dest, srcQty);
        (bestReserve, slippageRate) = kyberNetwork.findBestRate(src, dest, (srcQty * quantityFactor));

        if (expectedRate == 0) {
            expectedRate = expectedRateSmallQty(src, dest);
        }

        require(expectedRate <= MAX_RATE);

        worstCaseSlippageRate = ((10000 - worstCaseRateFactorInBps) * expectedRate) / 10000;
        if (slippageRate >= worstCaseSlippageRate) {
            slippageRate = worstCaseSlippageRate;
        }

        return (expectedRate, slippageRate);
    }

    //@dev for small src quantities dest qty might be 0, then returned rate is zero.
    //@dev for backward compatibility we would like to return non zero rate (correct one) for small src qty
    function expectedRateSmallQty(ERC20Clone src, ERC20Clone dest) internal view returns(uint) {
        address reserve;
        uint rateSrcToEth;
        uint rateEthToDest;
        (reserve, rateSrcToEth) = kyberNetwork.searchBestRate(src, ETH_TOKEN_ADDRESS, 0);
        (reserve, rateEthToDest) = kyberNetwork.searchBestRate(ETH_TOKEN_ADDRESS, dest, 0);
        return rateSrcToEth * rateEthToDest / PRECISION;
    }
}
