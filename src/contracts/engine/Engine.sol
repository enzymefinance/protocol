pragma solidity ^0.4.21;

import "auth.sol";
import "math.sol";
import "BurnableToken.sol";
import "PriceSource.i.sol";
import "Registry.sol";

/// @notice Liquidity contract and token sink
contract Engine is DSMath, DSAuth {

    event RegistryChange(address registry);
    event SetAmguPrice(uint amguPrice);
    event Thaw(uint amount);

    uint public frozenEther;
    uint public liquidEther;
    uint public lastThaw;
    uint public THAWING_DELAY;
    BurnableToken public mlnToken;
    PriceSourceInterface public priceSource;
    Registry public registry;
    uint public MLN_DECIMALS = 18;
    uint public amguPrice;
    uint public totalEtherConsumed;
    uint public totalAmguConsumed;
    uint public totalMlnBurned;

    constructor(uint _delay) {
        lastThaw = block.timestamp;
        THAWING_DELAY = _delay;
    }

    /// @dev only callable by deployer
    function setRegistry(address _registry) auth {
        registry = Registry(_registry);
        priceSource = PriceSourceInterface(registry.priceSource());
        mlnToken = BurnableToken(registry.mlnToken());
        emit RegistryChange(registry);
    }

    function setAmguPrice(uint _price) auth {
        amguPrice = _price;
        emit SetAmguPrice(_price);
    }

    function getAmguPrice() view returns (uint) { return amguPrice; }

    function premiumPercent() view returns (uint) {
        if (liquidEther < 1 ether) {
            return 0;
        } else if (liquidEther >= 1 ether && liquidEther < 5 ether) {
            return 5;
        } else if (liquidEther >= 5 ether && liquidEther < 10 ether) {
            return 10;
        } else if (liquidEther >= 10 ether) {
            return 15;
        }
    }

    function payAmguInEther() public payable {
        require(
            registry.isFundFactory(msg.sender) ||
            registry.isFund(msg.sender),
            "Sender must be a fund or the factory"
        );
        totalEtherConsumed = add(totalEtherConsumed, msg.value);
        if (amguPrice > 0) {
            totalAmguConsumed = add(totalAmguConsumed, msg.value / amguPrice);
        }
        frozenEther = add(frozenEther, msg.value);
    }

    /// @notice Move frozen ether to liquid pool after delay
    /// @dev Delay only restarts when this function is called
    function thaw() public {
        require(
            block.timestamp >= add(lastThaw, THAWING_DELAY),
            "Thawing delay has not passed"
        );
        require(frozenEther > 0, "No frozen ether to thaw");
        lastThaw = block.timestamp;
        liquidEther = add(liquidEther, frozenEther);
        emit Thaw(frozenEther);
        frozenEther = 0;
    }

    /// @return ETH per MLN including premium
    function enginePrice() public view returns (uint) {
        uint ethPerMln;
        (ethPerMln, ) = priceSource.getPrice(address(mlnToken));
        uint premium = mul(ethPerMln, (premiumPercent() / 100));
        return add(ethPerMln, premium);
    }

    function ethPayoutForMlnAmount(uint mlnAmount) public view returns (uint) {
        return mul(mlnAmount, enginePrice()) / 10 ** MLN_DECIMALS;
    }

    /// @notice MLN must be approved first
    function sellAndBurnMln(uint mlnAmount) public {
        require(registry.isFund(msg.sender), "Only funds can use the engine");
        require(
            mlnToken.transferFrom(msg.sender, address(this), mlnAmount),
            "MLN transferFrom failed"
        );
        uint ethToSend = ethPayoutForMlnAmount(mlnAmount);
        require(ethToSend > 0, "No ether to pay out");
        require(liquidEther >= ethToSend, "Not enough liquid ether to send");
        liquidEther = sub(liquidEther, ethToSend);
        totalMlnBurned = add(totalMlnBurned, mlnAmount);
        msg.sender.send(ethToSend);
        mlnToken.burn(mlnAmount);
    }
}

