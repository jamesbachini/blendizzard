// Set admin when the current admin is a G-address and you're trying to make a C-address the admin

import { Address, authorizeInvocation, Keypair, nativeToScVal, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { DEFAULT_TIMEOUT } from "@stellar/stellar-sdk/contract";
import { Api, assembleTransaction, Server } from "@stellar/stellar-sdk/rpc";

const feeVaultID = 'CBBY53VYJSMAWCBZZ7BHJZ5XSZNJUS4ZE6Q4RN7TKZGHPYHMEE467W7Y'

const contractID = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU'

const networkPassphrase = Networks.PUBLIC;

// Validate required environment variables
if (!process.env.RPC_URL || !process.env.ADMIN_SECRET) {
    throw new Error('Missing required environment variables. Please check your .env file.');
}

const rpc = new Server(process.env.RPC_URL);

const keypair = Keypair.fromSecret(process.env.ADMIN_SECRET);
const pubkey = keypair.publicKey(); // GD2GA2JF6OJURU36COZQWJLPEJ7XC3GB25TBD7U4ALCGKOG27262RICH

const acct = await rpc.getAccount(pubkey)
const tx = new TransactionBuilder(acct, {
    fee: (100_000).toString(),
    networkPassphrase
})
.addOperation(Operation.invokeContractFunction({
    contract: feeVaultID,
    function: 'set_admin',
    args: [
        Address.fromString(contractID).toScVal(),
    ]
}))
.setTimeout(0)
.build();

const simBefore = await rpc.simulateTransaction(tx);

if (
    Api.isSimulationError(simBefore)
    || !simBefore.result
    || !simBefore.result.auth
) {
    console.log(simBefore);
} else {
    console.log( await rpc._simulateTransaction(tx) );

    const entry = xdr.SorobanAuthorizationEntry.fromXDR(simBefore.result.auth[1]!.toXDR());
    const credentials = entry.credentials().address();
    const lastLedger = await rpc.getLatestLedger().then(({ sequence }) => sequence);

    credentials.signatureExpirationLedger(lastLedger + DEFAULT_TIMEOUT);
    credentials.signature(xdr.ScVal.scvVoid());

    const op = tx.operations[0] as Operation.InvokeHostFunction;

    const self_invocation = new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(contractID).toScAddress(),
        functionName: "__check_auth",
        args: [],
    });

    entry.rootInvocation().subInvocations().push(
        new xdr.SorobanAuthorizedInvocation({
            function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(self_invocation),
            subInvocations: [],
        })
    )

    op.auth?.splice(1, 1, entry);

    const dupe_entry = xdr.SorobanAuthorizationEntry.fromXDR(simBefore.result.auth[0]!.toXDR());

    dupe_entry.rootInvocation().subInvocations().push(
        new xdr.SorobanAuthorizedInvocation({
            function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(self_invocation),
            subInvocations: [],
        })
    )

    const self_entry = new xdr.SorobanAuthorizationEntry({
        credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
        rootInvocation: new xdr.SorobanAuthorizedInvocation({
            function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(self_invocation),
            subInvocations: [],
        }),
    });

    op.auth?.push(dupe_entry);

    // TODO Unclear if I actually needed this
    op.auth?.push(self_entry);

    console.log(tx.toXDR());

    console.log( await rpc._simulateTransaction(tx) );

    const simAfter = await rpc.simulateTransaction(tx);

    const txAssem = assembleTransaction(tx, simAfter).build();

    txAssem.sign(keypair);

    console.log(txAssem.toXDR());

    const sendRes = await rpc.sendTransaction(txAssem);
    const pollRes = await rpc.pollTransaction(sendRes.hash);

    if (pollRes.status === 'SUCCESS') {
        console.log(pollRes.status, pollRes.txHash);
    } else if  (pollRes.status === 'NOT_FOUND') {
        console.log(pollRes);
    } else {
        console.log(pollRes.envelopeXdr.toXDR('base64'));
        console.log('\n');
        console.log(pollRes.resultXdr.toXDR('base64'));
        console.log('\n');
        console.log(pollRes.resultMetaXdr.toXDR('base64'));
    }
}
