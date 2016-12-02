pragma solidity ^0.4.4;

import "./TradingProtocol.sol";
import "../dependencies/Owned.sol";


/// @title Trading Contract
/// @author Melonport AG <team@melonport.com>
contract Trading is TradingProtocol, Owned {


  function Trading() {}

  /// Place an Order on the selected Exchange
  function placeOrder(
    address _offerCurrency,
    uint256 _offerAmount,
    address _wantCurrency,
    uint256 _wantAmount
  ) only_owner returns (uint256 _offerId) {
    // Assert that asset is available
    /*if (module.register.lookup(_wantCurrency) == false) throw;
    if (module.register.lookup(_offerCurrency) == false) throw;*/
    // Init Exchange
    /* Find exchange module via register module*/
    /*return module.exchange.placeOrder(_offerCurrency, _offerAmount, _wantCurrency, _wantAmount);*/
  }
}
