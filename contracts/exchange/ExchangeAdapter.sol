pragma solidity ^0.4.11;

import './ExchangeInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';


/// @title ExchangeAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static ExchangeAdapter Module.
contract ExchangeAdapter is ExchangeInterface, DBC, Owned {}
