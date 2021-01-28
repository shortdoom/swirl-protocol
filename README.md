# Tonic -- Swirl

## Development

### Pre Requisites

Before running any command, make sure to install dependencies:

```sh
$ yarn install
```

### Compile

Compile the smart contracts with Hardhat:

```sh
$ yarn compile
```

### TypeChain

Compile the smart contracts and generate TypeChain artifacts:

```sh
$ yarn build
```

### Lint Solidity

Lint the Solidity code:

```sh
$ yarn lint:sol
```

### Lint TypeScript

Lint the TypeScript code:

```sh
$ yarn lint:ts
```

### Test

Run the Mocha tests:

```sh
$ yarn test
```

### Coverage

Generate the code coverage report:

```sh
$ yarn coverage
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ yarn clean
```

### Deploy

Deploys all contracts:

> Usage: hardhat [GLOBAL OPTIONS] deploy [--force <BOOLEAN>]\
> OPTIONS:\
>  --force Overwrite existing contracts (default: false)

```sh
$ yarn hardhat --network localhost deploy
```

## Operations

### Enable Base Token

Enables a base token for the DCA protocol

> Usage: hardhat [GLOBAL OPTIONS] enable-base-token [--address <STRING>]\
> OPTIONS:\
>  --address Token address (default: "")

```sh
$ yarn hardhat --network localhost enable-base-token --address 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
```

### Enable Order Token

Enables an order token for the DCA protocol

> Usage: hardhat [GLOBAL OPTIONS] enable-order-token [--address <STRING>] [--eth-is-base <BOOLEAN>] [--feed <STRING>]\
> OPTIONS:\
> --address Token address (default: "")\
> --eth-is-base True is the pair starts with ETH (e.g. ETH/USD) (default: false)\
> --feed Chainlink feed address for the pair ETH/TOKEN (default: "")

```sh
$ yarn hardhat --network localhost enable-order-token --address 0xeb4c2781e4eba804ce9a9803c67d0893436bb27d --feed 0xeb4c2781e4eba804ce9a9803c67d0893436bb27d
```

### Add Pool

Adds pool a new pool

> Usage: hardhat [GLOBAL OPTIONS] add-pool [--base <STRING>] [--order <STRING>] [--period <STRING>]\
> OPTIONS:\
> --base Base token address (default: "")\
> --order Order token address (default: "")\
> --period Period: NONE,HOURLY,DAILY,WEEKLY,FORTNIGHTLY,MONTHLY,QUARTERLY (default: "")
> --scaling Base token scaling factor exponent (default: "")

```sh
$ yarn hardhat --network localhost add-pool --base 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48   --order 0xeb4c2781e4eba804ce9a9803c67d0893436bb27d --period HOURLY --scaling 8
```

### Add Role

Adds address as role to all necessary contracts

> Usage: hardhat [GLOBAL OPTIONS] add-role [--address <STRING>] [--role <STRING>]\
> OPTIONS:\
> --address Base token address (default: "")\
> --role Roles: ADMIN,EXECUTOR,REGISTRAR (default: "")

```sh
$ yarn hardhat --network localhost  add-role --address 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 --role ADMIN
```

### Set Fees

Sets fees and recipient

> Usage: hardhat [GLOBAL OPTIONS] set-fees [--fees <INT>] [--recipient <STRING>]\
> OPTIONS:\
> --fees Fees expressed in BPS. Values: 0 to 300 (default: "")\
> --recipient Fees recipient address (default: "")

```sh
$ yarn hardhat --network localhost  set-fees --fees 200  --recipient 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
```
