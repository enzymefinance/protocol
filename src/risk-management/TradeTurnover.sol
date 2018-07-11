pragma solidity ^0.4.21;

import "../policies/Policy.sol";
import "../dependencies/Owned.sol";
import "../dependencies/math.sol";
import "../Fund.sol";



// TradeTurnover policy is run as a pre-condition
contract TradeTurnover is DSMath, Policy, Owned {

  uint private epochInBlocks;
  uint private epochBeginBlock;
  uint private epochResetBlock;

  uint private maxTrades;
  uint private currentEpochTrades;

  function TradeTurnover(uint _epochInBlocks, uint _maxTrades) public {
    require(_maxTrades>=1);
    require(_epochInBlocks>=1);
    epochInBlocks = _epochInBlocks;
    maxTrades = _maxTrades;
  }

  function getMaxTrades() public returns (uint) {
    return maxTrades;
  }

  function getCurrentEpochTrades() public returns (uint) {
    return currentEpochTrades;
  }

  function getEpochInBlocks() public returns (uint) {
    return epochInBlocks;
  }

  function getEpochBeginBlock() public returns (uint) {
    return epochBeginBlock;
  }

  function getEpochResetBlock() public returns (uint) {
    return epochResetBlock;
  }

  function resetCurrentEpochTrades() private {
    currentEpochTrades = 0;
  }

  /*
  function defineNewEpoch(uint _priorEpochResetBlock) private {
    epochBeginBlock = add(_priorEpochResetBlock, 1);
    epochResetBlock = add(epochBeginBlock, epochInBlocks);
  }
  */

  function rule(address[4] addresses, uint[2] values) external view returns (bool) {
    //initialize period-defining blocks if not already done
    //epoch begins with fund's first trade
    if (epochBeginBlock == 0) {
      currentEpochTrades = 0;
      epochBeginBlock = block.number; //start epochs with current block
      epochResetBlock = add(epochBeginBlock, epochInBlocks);
    }

    //epoch is inclusive of epoch-defining blocks
    if (block.number <= epochResetBlock) {
      //am i sane?
      require(block.number >= epochBeginBlock);

      //increment trade counter with this trade
      if (add(currentEpochTrades, 1) <= maxTrades){
        currentEpochTrades = add(currentEpochTrades, 1);
      }
    }

    //Trade happens outside of previously defined epoch
    if (block.number > epochResetBlock) {
      uint totalCatchUpBlocks;
      uint totalCatchUpEpochs;
      //reset trade counter
      resetCurrentEpochTrades();

      //add current trade to newly reset trade counter
      currentEpochTrades = add(currentEpochTrades, 1);

      //manage epochs
      totalCatchUpBlocks = block.number - epochResetBlock;
      totalCatchUpEpochs = totalCatchUpBlocks / epochInBlocks; //ignores remainder -> desired behavior
      epochBeginBlock = add(mul(totalCatchUpEpochs,epochInBlocks), 1); //add 1 to start the new epoch
      epochResetBlock = add(epochBeginBlock, epochInBlocks) ;
    }
    //policy rule - we're within the current epoch
    //maxTrades is an inclusive cap
    return (currentEpochTrades <= maxTrades);
  }

    function position() external view returns (uint) {
        return 0;
    }
}
