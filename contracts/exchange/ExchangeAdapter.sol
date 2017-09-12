pragma solidity ^0.4.11;

import './ExchangeInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';
import './existing/SimpleMarket.sol';


/// @title ExchangeAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice An adapter between the Melon protocol and DappHubs SimpleMarket
contract ExchangeAdapter is DBC, Owned, ExchangeInterface {

    // NON-CONSTANT METHODS

    function ExchangeAdapter(
        address ofSimpleMarket
    ) {

    }

}
