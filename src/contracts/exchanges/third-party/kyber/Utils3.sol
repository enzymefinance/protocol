pragma solidity 0.4.25;


import "./Utils2.sol";


contract Utils3 is Utils2 {

    function calcDestAmountWithDecimals(uint srcDecimals, uint destDecimals, uint srcAmount, uint rate) internal pure returns(uint) {
        return calcDstQty(srcAmount, srcDecimals, destDecimals, rate);
    }

}
