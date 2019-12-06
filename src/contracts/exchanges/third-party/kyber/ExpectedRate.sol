pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./KyberNetwork.sol";
import "./Withdrawable.sol";
import "./ExpectedRateInterface.sol";


contract ExpectedRate is Withdrawable, ExpectedRateInterface, Utils2 {

    KyberNetwork public kyberNetwork;
    uint public quantityFactor = 2;
    uint public worstCaseRateFactorInBps = 50;
    uint constant UNIT_QTY_FOR_FEE_BURNER = 10 ** 18;
    ERC20 public knc;

    function ExpectedRate(KyberNetwork _kyberNetwork, ERC20 _knc, address _admin) public {
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
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty, bool usePermissionless)
        public view
        returns (uint expectedRate, uint slippageRate)
    {
        require(quantityFactor != 0);
        require(srcQty <= MAX_QTY);
        require(srcQty * quantityFactor <= MAX_QTY);

        if (srcQty == 0) srcQty = 1;

        bool didRevert = false;

        (didRevert, expectedRate, slippageRate) = safeFindBestRate(src, dest, srcQty, usePermissionless);
        if (didRevert) return (0, 0);

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
    function expectedRateSmallQty(ERC20 src, ERC20 dest, uint srcQty, bool usePermissionless)
        internal view returns(uint)
    {
        address reserve;
        uint rateSrcToEth;
        uint rateEthToDest;
        (reserve, rateSrcToEth) = kyberNetwork.searchBestRate(src, ETH_TOKEN_ADDRESS, srcQty, usePermissionless);

        uint ethQty = calcDestAmount(src, ETH_TOKEN_ADDRESS, srcQty, rateSrcToEth);

        (reserve, rateEthToDest) = kyberNetwork.searchBestRate(ETH_TOKEN_ADDRESS, dest, ethQty, usePermissionless);
        return rateSrcToEth * rateEthToDest / PRECISION;
    }

    function safeFindBestRate(ERC20 src, ERC20 dest, uint srcQty, bool usePermissionless)
        internal view
        returns (bool didRevert, uint expectedRate, uint slippageRate)
    {
        bytes4 sig = usePermissionless ?
            bytes4(keccak256("findBestRate(address,address,uint256)")) :
            bytes4(keccak256("findBestRateOnlyPermission(address,address,uint256)")); //Function signatures

        (didRevert, expectedRate) = assemblyFindBestRate(src, dest, srcQty, sig);

        if (didRevert) return (true, 0, 0);

        if (quantityFactor != 1) {
            (didRevert, slippageRate) = assemblyFindBestRate(src, dest, (srcQty * quantityFactor), sig);
        } else {
            slippageRate = expectedRate;
        }
    }

    function assemblyFindBestRate(ERC20 src, ERC20 dest, uint srcQty, bytes4 sig)
        internal view
        returns (bool didRevert, uint rate)
    {
        address addr = address(kyberNetwork);  // kyber address
        uint success;

        assembly {
            let x := mload(0x40)        // "free memory pointer"
            mstore(x,sig)               // function signature
            mstore(add(x,0x04),src)     // src address padded to 32 bytes
            mstore(add(x,0x24),dest)    // dest padded to 32 bytes
            mstore(add(x,0x44),srcQty)  // uint 32 bytes
            mstore(0x40,add(x,0xa4))    // set free storage pointer to empty space after output

            // input size = sig + ERC20 (address) + ERC20 + uint
            // = 4 + 32 + 32 + 32 = 100 = 0x64
            success := staticcall(
                gas,  // gas
                addr, // Kyber addr
                x,    // Inputs at location x
                0x64, // Inputs size bytes
                add(x, 0x64),    // output storage after input
                0x40) // Output size are (uint, uint) = 64 bytes

            rate := mload(add(x,0x84))  //Assign 2nd output to rate, first output not used,
            mstore(0x40,x)    // Set empty storage pointer back to start position
        }

        if (success != 1) didRevert = true;
    }
}
