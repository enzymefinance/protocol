pragma solidity 0.4.25;


import "./ERC20Interface.sol";
import "./KyberNetwork.sol";
import "./Withdrawable.sol";
import "./ExpectedRateInterface.sol";


contract ExpectedRate is Withdrawable, ExpectedRateInterface, Utils2 {

    KyberNetwork public kyberNetwork;
    uint public quantityFactor = 2;
    uint public worstCaseRateFactorInBps = 50;
    uint constant UNIT_QTY_FOR_FEE_BURNER = 10 ** 18;
    ERC20KyberClone public knc;

    function ExpectedRate(KyberNetwork _kyberNetwork, ERC20KyberClone _knc, address _admin) public {
        require(_admin != address(0));
        require(_knc != address(0));
        require(_kyberNetwork != address(0));
        kyberNetwork = _kyberNetwork;
        admin = _admin;
        knc = _knc;
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
    function getExpectedRate(ERC20KyberClone src, ERC20KyberClone dest, uint srcQty, bool usePermissionless)
        public view
        returns (uint expectedRate, uint slippageRate)
    {
        require(quantityFactor != 0);
        require(srcQty <= MAX_QTY);
        require(srcQty * quantityFactor <= MAX_QTY);

        if (srcQty == 0) srcQty = 1;

        //not needed
        uint bestReserve;

        if (usePermissionless) {
            (bestReserve, expectedRate) = kyberNetwork.findBestRate(src, dest, srcQty);

            if (quantityFactor != 1) {
                (bestReserve, slippageRate) = kyberNetwork.findBestRate(src, dest, (srcQty * quantityFactor));
            } else {
                slippageRate = expectedRate;
            }
        } else {
            (bestReserve, expectedRate) = kyberNetwork.findBestRateOnlyPermission(src, dest, srcQty);

            if (quantityFactor != 1) {
                (bestReserve, slippageRate) = kyberNetwork.findBestRateOnlyPermission(src, dest,
                    (srcQty * quantityFactor));
            } else {
                slippageRate = expectedRate;
            }
        }

        if (expectedRate == 0) {
            expectedRate = expectedRateSmallQty(src, dest, srcQty, usePermissionless);
        }

        if (src == knc &&
            dest == ETH_TOKEN_ADDRESS &&
            srcQty == UNIT_QTY_FOR_FEE_BURNER )
        {
            if (checkKncArbitrageRate(expectedRate)) expectedRate = 0;
        }

        if (expectedRate > MAX_RATE) return (0, 0);

        uint worstCaseSlippageRate = ((10000 - worstCaseRateFactorInBps) * expectedRate) / 10000;
        if (slippageRate >= worstCaseSlippageRate) {
            slippageRate = worstCaseSlippageRate;
        }

        return (expectedRate, slippageRate);
    }

    function checkKncArbitrageRate(uint currentKncToEthRate) public view returns(bool) {
        uint converseRate;
        uint slippage;
    	(converseRate, slippage) = getExpectedRate(ETH_TOKEN_ADDRESS, knc, UNIT_QTY_FOR_FEE_BURNER, true);

        // if returned rate is 0, can't trust this arb test. assume we have arb
        if(converseRate == 0) return true;

        require(converseRate <= MAX_RATE && currentKncToEthRate <= MAX_RATE);
        return ((converseRate * currentKncToEthRate) > (PRECISION ** 2));
    }

    //@dev for small src quantities dest qty might be 0, then returned rate is zero.
    //@dev for backward compatibility we would like to return non zero rate (correct one) for small src qty
    function expectedRateSmallQty(ERC20KyberClone src, ERC20KyberClone dest, uint srcQty, bool usePermissionless)
        internal view returns(uint)
    {
        address reserve;
        uint rateSrcToEth;
        uint rateEthToDest;
        (reserve, rateSrcToEth) = kyberNetwork.searchBestRate(src, ETH_TOKEN_ADDRESS, srcQty, usePermissionless);

        uint ethQty = calcDestAmount(src, ETH_TOKEN_ADDRESS, srcQty, rateSrcToEth);
        if (ethQty == 0) ethQty = 1;

        (reserve, rateEthToDest) = kyberNetwork.searchBestRate(ETH_TOKEN_ADDRESS, dest, ethQty, usePermissionless);
        return rateSrcToEth * rateEthToDest / PRECISION;
    }
}
