pragma solidity 0.6.1;

import "../dependencies/DSMath.sol";
import "../dependencies/token/BurnableToken.sol";
import "../prices/IPriceSource.sol";
import "../fund/participation/IParticipation.sol";
import "../fund/trading/Trading.sol";
import "../version/Registry.sol";

/// @notice Liquidity contract and token sink
contract Engine is DSMath {

    event RegistryChange(address registry);
    event SetAmguPrice(uint amguPrice);
    event AmguPaid(uint amount);
    event Thaw(uint amount);
    event Burn(uint amount);
    event RequestExecutedForIncentive(
        address indexed participationContract,
        address indexed requestOwner,
        uint256 incentiveAmount
    );

    uint public constant MLN_DECIMALS = 18;

    Registry public registry;
    uint public amguPrice;
    uint public frozenEther;
    uint public liquidEther;
    uint public lastThaw;
    uint public thawingDelay;
    uint public totalEtherConsumed;
    uint public totalAmguConsumed;
    uint public totalMlnBurned;

    constructor(uint _delay, address _registry) public {
        lastThaw = block.timestamp;
        thawingDelay = _delay;
        _setRegistry(_registry);
    }

    modifier onlyFund() {
        require(
            registry.isFund(msg.sender),
            "Only funds can use the engine"
        );
        _;
    }

    modifier onlyMGM() {
        require(
            msg.sender == registry.MGM(),
            "Only MGM can call this"
        );
        _;
    }

    /// @dev Registry owner is MTC
    modifier onlyMTC() {
        require(
            msg.sender == registry.owner(),
            "Only MTC can call this"
        );
        _;
    }

    function _setRegistry(address _registry) internal {
        registry = Registry(_registry);
        emit RegistryChange(address(registry));
    }

    /// @dev only callable by MTC
    function setRegistry(address _registry)
        external
        onlyMTC
    {
        _setRegistry(_registry);
    }

    /// @dev set price of AMGU in MLN (base units)
    /// @dev only callable by MGM
    function setAmguPrice(uint _price)
        external
        onlyMGM
    {
        amguPrice = _price;
        emit SetAmguPrice(_price);
    }

    function getAmguPrice() public view returns (uint) { return amguPrice; }

    function premiumPercent() public view returns (uint) {
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

    /// @dev only Funds can transfer ETH to the Engine
    /// @dev not adding to liquidEther, since it is immediately sent away again
    function receiveIncentiveInEth() external payable onlyFund {}

    function payAmguInEther() external payable {
        require(
            registry.isFundFactory(msg.sender) ||
            registry.isFund(msg.sender),
            "Sender must be a fund or the factory"
        );
        uint mlnPerAmgu = getAmguPrice();
        uint ethPerMln;
        (ethPerMln,) = priceSource().getPrice(address(mlnToken()));
        uint amguConsumed;
        if (mlnPerAmgu > 0 && ethPerMln > 0) {
            amguConsumed = (mul(msg.value, 10 ** uint(MLN_DECIMALS))) / (mul(ethPerMln, mlnPerAmgu));
        } else {
            amguConsumed = 0;
        }
        totalEtherConsumed = add(totalEtherConsumed, msg.value);
        totalAmguConsumed = add(totalAmguConsumed, amguConsumed);
        frozenEther = add(frozenEther, msg.value);
        emit AmguPaid(amguConsumed);
    }

    /// @notice Move frozen ether to liquid pool after delay
    /// @dev Delay only restarts when this function is called
    function thaw() external {
        require(
            block.timestamp >= add(lastThaw, thawingDelay),
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
        (ethPerMln, ) = priceSource().getPrice(address(mlnToken()));
        uint premium = (mul(ethPerMln, premiumPercent()) / 100);
        return add(ethPerMln, premium);
    }

    /// @return Amount of liquid ETH to give for some amount of MLN
    function ethPayoutForMlnAmount(uint mlnAmount) public view returns (uint) {
        return mul(mlnAmount, enginePrice()) / 10 ** uint(MLN_DECIMALS);
    }

    /// @return Amount of MLN needed to receive some _incentive amount of ETH
    function mlnRequiredForIncentiveAmount(uint256 _incentive) public view returns (uint256) {
        return mul(_incentive, 1 ether) / enginePrice();
    }

    /// @dev MLN must be approved first
    function sellAndBurnMln(uint mlnAmount)
        external
        onlyFund
    {
        require(
            mlnToken().transferFrom(msg.sender, address(this), mlnAmount),
            "MLN transferFrom failed"
        );
        uint ethToSend = ethPayoutForMlnAmount(mlnAmount);
        require(ethToSend > 0, "No ether to pay out");
        require(liquidEther >= ethToSend, "Not enough liquid ether to send");
        liquidEther = sub(liquidEther, ethToSend);
        totalMlnBurned = add(totalMlnBurned, mlnAmount);
        msg.sender.transfer(ethToSend);
        mlnToken().burn(mlnAmount);
        emit Burn(mlnAmount);
    }

    /// @dev MLN must be approved first
    function executeRequestAndBurnMln(
        address _participation,
        address _requestOwner
    )
        external
        onlyFund
    {
        uint256 incentiveAmount = IParticipation(_participation).getRequestIncentive(_requestOwner);
        uint256 mlnAmount = mlnRequiredForIncentiveAmount(incentiveAmount);
        require(
            mlnToken().transferFrom(msg.sender, address(this), mlnAmount),
            "MLN transferFrom failed"
        );
        mlnToken().burn(mlnAmount);
        IParticipation(_participation).executeRequestFor(_requestOwner);
        require(msg.sender.send(incentiveAmount), "Incentive transfer failed");
        emit RequestExecutedForIncentive(_participation, _requestOwner, incentiveAmount);
        emit Burn(mlnAmount);
    }

    /// @dev Get MLN from the registry
    function mlnToken()
        public
        view
        returns (BurnableToken)
    {
        return BurnableToken(registry.mlnToken());
    }

    /// @dev Get PriceSource from the registry
    function priceSource()
        public
        view
        returns (IPriceSource)
    {
        return IPriceSource(registry.priceSource());
    }
}
