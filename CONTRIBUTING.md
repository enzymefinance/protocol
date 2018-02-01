## Pull requests and reviews

The main branch that development work occurs on is the `develop` branch. It is usually encouraged to branch from there, and make pull requests back to `develop` when the change is made.

When making a pull request for a new feature please follow the styleguides outlined in this document.
Also, where applicable, add tests that cover the introduced code.
Ideally, code coverage should not decrease when we merge pull requests.

When a pull request is created, one of the maintainers will review the code, and incorporate it into the relevant branch.

## Making a release

The steps to make a new release are as follows:

```sh
npm run compile    # update artifacts in out/
npm test           # passes on development network
npm version 0.6.4  # or whatever version number
npm run deploy:net # run for each network you need
npm publish        # updates the NPM package
git push --follow-tags
```

## Styleguides

### Solidity

The purpose of this style guide is to increase consistency within and between our contracts.
This makes them more legible, thereby helping maintain a high level of security.

This document can be seen as an "extension" of the [official Solidity style guide](http://solidity.readthedocs.io/en/develop/style-guide.html).

This means that rules from the official guide are inherited, and may be overriden if necessary.

#### General tips

- if you use a piece of code more than once, consider making it into a function
- conversely, if you use a snippet of code *only* once, consider not placing it inside a function
  - note that this mainly applies to `internal` functions, not functions that users interact with
- be careful when declaring `for-` loops with a dynamic upper-bound, since the call may run out of gas for some input
- validate inputs using `pre_cond` (Design-by-Contract), or `require(...)` statements
- prefer full words over abbreviations in general, when naming functions and variables

#### Layout

- datatypes and contract-level state variables are declared before functions
  - mark these blocks of code with `// TYPES` and `// STATE`, respectively
- within a contract, group functions by their visibility, as in [this section](http://solidity.readthedocs.io/en/develop/style-guide.html#order-of-functions)
  - mark each visibility block with a comment above it, such as `// PUBLIC METHODS`
  - within each visibility block, functions can be grouped again by topic, if necessary. Consider the example below:

```
// PUBLIC METHODS

// PUBLIC : ADMINISTRATION

...

// PUBLIC : ACCOUNTING

...
```
#### Syntax

- indentation is done in multiples of **4 spaces**
- `snake_case` for modifiers
- `camelCase` for functions and variables
- `PascalCase` for types and contracts names
- prefer parameter naming in the `ofX` style where it sounds correct. For example: `function register(address ofOwner, address ofUser)...`.
- always use visibility modifiers for functions
  - for example, `public` functions that are not used internally should be denoted as `external`
- avoid using `tx.origin` when possible, since it [may become deprecated](https://ethereum.stackexchange.com/a/200/7328)
- use `require(...)` for input or condition validation, similar to pre-conditions
  - statements like `if(condition) { throw; }` can be replaced by `require(condition)`
- use `assert(...)` to check for internal errors, such as invariant breaks, or other conditions that should never occur
- place modifier statements and return statements on their own lines after the function name.
  - ordering of statements is:
    1. visibility modifier
    2. state-promise modifier (`view`, `pure`)
    3. `payable` modifier (if necessary)
    4. custom modifiers (e.g. `pre_cond`)
    5. `returns` statement

One example:

```
function readPrice(
    address exchange,
    address ofAsset,
    uint extraParam
)
    external
    view
    pre_cond(extraParam > 0)
    returns(uint price)
{
    ...
}
```

- consider placing function arguments on their own lines, when there are more than one (as in above example)
- "one-liner" functions (i.e. can reasonably fit on a single line) are excepted from the above line-spacing rules

#### Modularity

- when possible, outsource repeated subfunctionality to a dependency (from a trusted/audited source, of course)
  - for example, consider using an overflow-protected "safe math" library like `ds-math`, rather than just the math operators

#### Natspec

We use [Natspec](https://github.com/ethereum/wiki/wiki/Ethereum-Natural-Specification-Format) annotations for our functions, which can be parsed to generate documentation.

- functions that are visible to users (i.e. `external` and `public` functions) should have Natspec notes
- functions with multiple return values need to use object-like annotation, with multiline comments
  - these functions should use multiline comments around all Natspec comments as well. Consider this example:

```solidity
/**
@notice Send tokens to another address, and get back the balances before/after balances
@param toAddress The address to receive funds
@return {
    "oldBalance": "The balance before sending funds",
    "newBalance": "The balance after sending funds"
}
*/
function sendFunds(address toAddress)
    returns (uint oldBalance, uint newBalance)
{
    ...
}
```
