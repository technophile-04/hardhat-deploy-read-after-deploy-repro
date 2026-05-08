# Repro: read-after-write race when reading from a freshly deployed contract

**Stack:** `hardhat@^3.4.0`, `hardhat-deploy@^2.0.4`, `rocketh@^0.19.4`
**Forked from:** [`wighawag/template-ethereum-contracts`](https://github.com/wighawag/template-ethereum-contracts)

## TL;DR

After `env.deploy(...)` returns, calling `env.read(...)` on the same deployment in the next line throws `AbiDecodingZeroDataError: Cannot decode zero data ("0x")` against load-balanced public RPC providers (Alchemy, public testnet endpoints).

The deploy itself succeeds. The contract is on-chain. The race is between rocketh handing back control and the LB replica that handles the next `eth_call` having seen the post-deploy block.

There is no first-class API in `@rocketh/deploy` to wait for code visibility before reading. `DeployOptions` does not accept a `confirmations` field; the only knob is `confirmationsRequired` per chain on `ChainUserConfig`. Users have to hand-roll the wait at every call site.

## Why it matters

Every "deploy then sanity-read" pattern in tutorials, scaffolds, and example repos hits this. We ran into it migrating [scaffold-eth-2](https://github.com/scaffold-eth/scaffold-eth-2) from hardhat 2 to hardhat 3 ([PR #1272](https://github.com/scaffold-eth/scaffold-eth-2/pull/1272)) — the default deploy script reads back the constructor-set greeting, and that read fails on OP Sepolia and Base Sepolia ~50% of the time.

In hardhat 2 + hardhat-deploy v1, the same pattern worked because ethers' `getContract` / `tx.wait()` did `eth_getCode` polling internally. v3 + rocketh + viem cut that out for cleanliness, which exposes the underlying network race.

## Reproduction

```bash
git clone <this-repo>
cd <this-repo>
pnpm install

# Override the placeholder PK with one that has OP Sepolia ETH:
echo 'DEPLOYER_PRIVATE_KEY="0x<your-funded-key>"' > contracts/.env.local

# Trigger the race (--reset forces a fresh tx every run):
pnpm contracts:deploy --network optimism-sepolia --reset
```

Expected error (hits ~50% of runs, more often if you re-run quickly):

```
AbiDecodingZeroDataError: Cannot decode zero data ("0x") with ABI parameters.

Version: viem@2.48.x
    at decodeAbiParameters
    at decodeFunctionResult
    at @rocketh/read-execute/src/index.ts:268
    at deploy/001_deploy_your_contract.ts:32
```

Local hardhat node does not reproduce: single replica, no LB, no race.

## What's going on

1. `env.deploy("YourContract", { ... })` broadcasts the deploy tx.
2. Rocketh's `waitForTransaction` polls `eth_getTransactionReceipt` until a receipt comes back. That hits **replica A**.
3. Receipt has the contract address. Rocketh returns. No bytecode-existence check.
4. The next line, `env.read(yourContract, { functionName: "greeting" })`, issues `eth_call` with `blockTag: "latest"`. The LB routes it to **replica B** which hasn't yet replicated the block containing the new contract.
5. Replica B returns `0x` (no code at the address from its view).
6. `viem.decodeFunctionResult` throws `AbiDecodingZeroDataError`.

## Suggested fix (for discussion)

Two non-exclusive options:

### Option A: per-call `confirmations` in `DeployOptions`

```ts
await env.deploy("YourContract", {
  account: deployer,
  artifact: artifacts.YourContract,
  args: [deployer],
  confirmations: 2, // <-- new field
});
```

Internally maps to the existing `waitForTransactionReceipt({ hash, confirmations })` logic that's already in `rocketh/src/environment/index.ts:648-687`, just exposed per-deploy instead of only per-chain.

### Option B: exported `waitForCode` / `waitForDeployment` helper

```ts
import { waitForDeployment } from "rocketh"; // or @rocketh/deploy

const yourContract = await env.deploy("YourContract", { ... });
await waitForDeployment(env, yourContract);
const greeting = await env.read(yourContract, { functionName: "greeting" });
```

A direct `eth_getCode` poll is the most precise signal — it answers "is the bytecode visible to whatever replica handles our next call?" rather than relying on block-number progression as a proxy.

Either one removes the need for every user to wrap a deploy script in defensive code.

## Files of interest

- `contracts/src/YourContract/YourContract.sol` — minimal contract with a constructor-set `greeting`
- `contracts/deploy/001_deploy_your_contract.ts` — the failing case (deploy → immediate read)
- `contracts/hardhat.config.ts` — adds `optimismSepolia` and `baseSepolia` networks using a plain `DEPLOYER_PRIVATE_KEY`
- `contracts/.env` — placeholder PK + override instructions

## Related

- scaffold-eth-2 hardhat-v3 migration PR: scaffold-eth/scaffold-eth-2#1272
- npm-package artifacts gap (separate issue from same migration): wighawag/hardhat-deploy#599
