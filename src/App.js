import React from 'react'
import { RadioGroup, Radio, } from "@blueprintjs/core";
import "../node_modules/@blueprintjs/core/lib/css/blueprint.css";
import "../node_modules/@blueprintjs/icons/lib/css/blueprint-icons.css";
import "../node_modules/normalize.css/normalize.css";
import {
    Address,
    TransactionUnspentOutput,
    TransactionUnspentOutputs,
    TransactionOutput,
    Value,
    TransactionBuilder,
    TransactionBuilderConfigBuilder,
    LinearFee,
    BigNum,
    TransactionWitnessSet,
    Transaction,
    AuxiliaryData,
    GeneralTransactionMetadata,
    TransactionMetadatum,
    BaseAddress,
    Ed25519KeyHash,
} from "@emurgo/cardano-serialization-lib-asmjs"
import "./App.css";


let Buffer = require('buffer/').Buffer

class App extends React.Component {
    constructor(props)
    {
        super(props);

        this.state = {
            whichWalletSelected: undefined,
            walletFound: false,
            walletIsEnabled: false,
            walletName: undefined,
            walletIcon: undefined,
            walletAPIVersion: undefined,
            wallets: [],
            networkId: undefined,
            Utxos: undefined,
            balance: undefined,
            changeAddress: undefined,
            usedAddress: undefined,
            // Txs
            cip95ResultTx: "",
            cip95ResultHash: "",
            cip95ResultWitness: "",
            cip95MetadataURL: undefined,
            cip95MetadataHash: undefined,

            // register for buidler fest
            // addr1z8aj8fucpe9rnwxv52u4htyhe7h39txjf9pvzrfw0sdlzkun36yuhgl049rxhhuckm2lpq3rmz5dcraddyl45d6xgvqqwdcx5c
            regAddress: "addr1z8aj8fucpe9rnwxv52u4htyhe7h39txjf9pvzrfw0sdlzkun36yuhgl049rxhhuckm2lpq3rmz5dcraddyl45d6xgvqqwdcx5c",
            // 300 ADA (300,000,000 lovelace)
            regAmount: "300000000",
            // Transaction metadatum label
            regLabel: "98117105100108",
            // Transaction metadatum text
            regText: "Cardano Buidler Fest #1",
            // wallets stake credential
            stakeCred: undefined,
            // wallets payment credential
            paymentCredential: undefined,
        }

        /**
         * When the wallet is connect it returns the connector which is
         * written to this API variable and all the other operations
         * run using this API object
         */
        this.API = undefined;

        this.protocolParams = {
            linearFee: {
                minFeeA: "44",
                minFeeB: "155381",
            },
            minUtxo: "34482",
            poolDeposit: "500000000",
            keyDeposit: "2000000",
            maxValSize: 5000,
            maxTxSize: 16384,
            priceMem: 0.0577,
            priceStep: 0.0000721,
            coinsPerUtxoWord: "34482",
        }
        this.pollWallets = this.pollWallets.bind(this);
    }

    /**
     * Poll the wallets it can read from the browser.
     * Sometimes the html document loads before the browser initialized browser plugins (like Nami or Flint).
     * So we try to poll the wallets 3 times (with 1 second in between each try).
     *
     * @param count The current try count.
     */
    pollWallets = (count = 0) => {
        const wallets = [];
        for(const key in window.cardano) {
            if (window.cardano[key].enable && wallets.indexOf(key) === -1) {
                wallets.push(key);
            }
        }
        if (wallets.length === 0 && count < 3) {
            setTimeout(() => {
                this.pollWallets(count + 1);
            }, 1000);
            return;
        }
        this.setState({
            wallets,
            whichWalletSelected: wallets[0]
        }, () => {
            this.refreshData()
        });
    }

    handleWalletSelect = (obj) => {
        const whichWalletSelected = obj.target.value
        this.setState({whichWalletSelected},
            () => {
                this.refreshData()
            })
    }

    checkIfWalletFound = () => {
        const walletKey = this.state.whichWalletSelected;
        const walletFound = !!window?.cardano?.[walletKey];
        this.setState({walletFound})
        return walletFound;
    }

    checkIfWalletEnabled = async () => {
        let walletIsEnabled = false;
        try {
            const walletName = this.state.whichWalletSelected;
            walletIsEnabled = await window.cardano[walletName].isEnabled();
        } catch (err) {
            console.log(err)
        }
        this.setState({walletIsEnabled});
        return walletIsEnabled;
    }

    enableWallet = async () => {
        const walletKey = this.state.whichWalletSelected;
        try {
            this.API = await window.cardano[walletKey].enable();
        } catch(err) {
            console.log(err);
        }
        return this.checkIfWalletEnabled();
    }

    getWalletName = () => {
        const walletKey = this.state.whichWalletSelected;
        const walletName = window?.cardano?.[walletKey].name;
        this.setState({walletName})
        return walletName;
    }

    getNetworkId = async () => {
        try {
            const networkId = await this.API.getNetworkId();
            this.setState({networkId})
        } catch (err) {
            console.log(err)
        }
    }

    /**
     * Gets the UTXOs from the user's wallet and then
     * stores in an object in the state
     * @returns {Promise<void>}
     */
    getUtxos = async () => {
        let Utxos = [];
        try {
            const rawUtxos = await this.API.getUtxos();
            for (const rawUtxo of rawUtxos) {
                const utxo = TransactionUnspentOutput.from_bytes(Buffer.from(rawUtxo, "hex"));
                const input = utxo.input();
                const txid = Buffer.from(input.transaction_id().to_bytes(), "utf8").toString('hex');
                const txindx = input.index();
                const output = utxo.output();
                const amount = output.amount().coin().to_str(); // ADA amount in lovelace
                const multiasset = output.amount().multiasset();
                let multiAssetStr = "";
                if (multiasset) {
                    const keys = multiasset.keys() // policy Ids of thee multiasset
                    const N = keys.len();
                    // console.log(`${N} Multiassets in the UTXO`)
                    for (let i = 0; i < N; i++){
                        const policyId = keys.get(i);
                        const policyIdHex = Buffer.from(policyId.to_bytes(), "utf8").toString('hex');
                        // console.log(`policyId: ${policyIdHex}`)
                        const assets = multiasset.get(policyId)
                        const assetNames = assets.keys();
                        const K = assetNames.len()
                        // console.log(`${K} Assets in the Multiasset`)

                        for (let j = 0; j < K; j++) {
                            const assetName = assetNames.get(j);
                            const assetNameString = Buffer.from(assetName.name(),"utf8").toString();
                            const assetNameHex = Buffer.from(assetName.name(),"utf8").toString("hex")
                            const multiassetAmt = multiasset.get_asset(policyId, assetName)
                            multiAssetStr += `+ ${multiassetAmt.to_str()} + ${policyIdHex}.${assetNameHex} (${assetNameString})`
                            // console.log(assetNameString)
                            // console.log(`Asset Name: ${assetNameHex}`)
                        }
                    }
                }
                const obj = {
                    txid: txid,
                    txindx: txindx,
                    amount: amount,
                    str: `${txid} #${txindx} = ${amount}`,
                    multiAssetStr: multiAssetStr,
                    TransactionUnspentOutput: utxo
                }
                Utxos.push(obj);
                // console.log(`utxo: ${str}`)
            }
            this.setState({Utxos})
        } catch (err) {
            console.log(err)
        }
    }

    getBalance = async () => {
        try {
            const balanceCBORHex = await this.API.getBalance();
            const balance = Value.from_bytes(Buffer.from(balanceCBORHex, "hex")).coin().to_str();
            this.setState({balance})
        } catch (err) {
            console.log(err)
        }
    }

    getChangeAddress = async () => {
        try {
            const raw = await this.API.getChangeAddress();
            const changeAddress = Address.from_bytes(Buffer.from(raw, "hex")).to_bech32()
            this.setState({changeAddress})
        } catch (err) {
            console.log(err)
        }
    }

    getUsedAddresses = async () => {
        try {
            const raw = await this.API.getUsedAddresses();
            const rawFirst = raw[0];
            const usedAddress = Address.from_bytes(Buffer.from(rawFirst, "hex")).to_bech32()
            this.setState({usedAddress})

        } catch (err) {
            console.log(err)
        }
    }

    refreshCIP30State = async () => {
        await this.setState({
            Utxos: null,
            balance: null,
            changeAddress: null,
            usedAddress: null,
            stakeCred: null,
            paymentCredential: null,
        });
    }

    /**
     * Refresh all the data from the user's wallet
     * @returns {Promise<void>}
     */
    refreshData = async () => {
        try {
            const walletFound = this.checkIfWalletFound();
            if (walletFound) {
                await this.getWalletName();
                let walletEnabled;
                walletEnabled = await this.enableWallet()

                // If wallet is enabled/connected
                if (walletEnabled) {
                    // CIP-30 API calls
                    await this.getNetworkId();
                    await this.getUtxos();
                    await this.getBalance();
                    await this.getChangeAddress();
                    await this.getUsedAddresses();
                    // Get the wallet's stake credential
                    await this.getStakeCredFromUsedAddress();
                    await this.getPaymentCredFromChangeAddress();
                // else if connection failed, reset all state
                } else {
                    this.setState({walletIsEnabled: false})
                    await this.refreshCIP30State();
                }

            } else {
                this.setState({walletIsEnabled: false})
                await this.refreshCIP30State();
            }
        } catch (err) {
            console.log(err)
        }
    }

    /**
     * Every transaction starts with initializing the
     * TransactionBuilder and setting the protocol parameters
     * This is boilerplate
     * @returns {Promise<TransactionBuilder>}
     */
    initTransactionBuilder = async () => {
        const txBuilder = TransactionBuilder.new(
            TransactionBuilderConfigBuilder.new()
                .fee_algo(LinearFee.new(BigNum.from_str(this.protocolParams.linearFee.minFeeA), BigNum.from_str(this.protocolParams.linearFee.minFeeB)))
                .pool_deposit(BigNum.from_str(this.protocolParams.poolDeposit))
                .key_deposit(BigNum.from_str(this.protocolParams.keyDeposit))
                .coins_per_utxo_word(BigNum.from_str(this.protocolParams.coinsPerUtxoWord))
                .max_value_size(this.protocolParams.maxValSize)
                .max_tx_size(this.protocolParams.maxTxSize)
                .prefer_pure_change(true)
                .build()
        );
        return txBuilder
    }
    
    /**
     * Builds an object with all the UTXOs from the user's wallet
     * @returns {Promise<TransactionUnspentOutputs>}
     */
    getTxUnspentOutputs = async () => {
        let txOutputs = TransactionUnspentOutputs.new()
        for (const utxo of this.state.Utxos) {
            txOutputs.add(utxo.TransactionUnspentOutput)
        }
        return txOutputs
    }

    getStakeCredFromUsedAddress = async () => {
        try {
            const raw = await this.API.getUsedAddresses();
            const rawFirst = raw[0];
            const usedAddress = Address.from_bytes(Buffer.from(rawFirst, "hex")).to_bech32()
            // get the stake credential from the used address
            let stakeCred = BaseAddress.from_address(Address.from_bech32(usedAddress)).stake_cred().to_keyhash();
            stakeCred = stakeCred.to_hex();
            this.setState({stakeCred})

        } catch (err) {
            console.log(err)
        }
    }

    getPaymentCredFromChangeAddress = async () => {
        try {
            const rawAddress = await this.API.getChangeAddress();
            const changeAddress = Address.from_bytes(Buffer.from(rawAddress, "hex")).to_bech32()
            // get the payment credential from the change address
            let paymentCred = BaseAddress.from_address(Address.from_bech32(changeAddress)).payment_cred().to_keyhash();
            paymentCred = paymentCred.to_hex();
            this.setState({paymentCred})

        } catch (err) {
            console.log(err)
        }
    }

    buildSignSubmitReg = async () => {
        try {
            // Initialize builder with protocol parameters
            const txBuilder = await this.initTransactionBuilder();

            // Set address to send ada to
            const registrationAddress = Address.from_bech32(this.state.regAddress);
            // Set amount to send
            const registrationAmount = Value.new(BigNum.from_str(this.state.regAmount));

            // Set transactional metadatum message
            const regMessageMetadatum = TransactionMetadatum.new_text(this.state.regText)
            const regMessageMetadatumLabel = BigNum.from_str(this.state.regLabel)

            // Create Tx metadata object and parse into auxiliary data
            const txMetadata = (GeneralTransactionMetadata.new())
            txMetadata.insert(regMessageMetadatumLabel, regMessageMetadatum);
            const auxMetadata = AuxiliaryData.new()
            auxMetadata.set_metadata(txMetadata);

            // Add metadatum to transaction builder, so it can be included in the transaction balancing
            txBuilder.set_auxiliary_data(auxMetadata)

            // Add extra signature witness to transaction builder
            // txBuilder.add_required_signer(Ed25519KeyHash.from_hex(this.state.stakeCred));

            // Add outputs to the transaction builder
            txBuilder.add_output(
                TransactionOutput.new(
                    registrationAddress,
                    registrationAmount
                ),
            );

            // Find the available UTxOs in the wallet and use them as Inputs for the transaction
            await this.getUtxos();
            const txUnspentOutputs = await this.getTxUnspentOutputs();
            // Use UTxO selection strategy RandomImproveMultiAsset aka 3
            txBuilder.add_inputs_from(txUnspentOutputs, 3)

            // Set change address, incase too much ADA provided for fee
            const shelleyChangeAddress = Address.from_bech32(this.state.changeAddress);
            txBuilder.add_change_if_needed(shelleyChangeAddress)

            // Make a full transaction, passing in empty witness set
            const txBody = txBuilder.build();
            const transactionWitnessSet = TransactionWitnessSet.new();
            const tx = Transaction.new(
                txBody,
                TransactionWitnessSet.from_bytes(transactionWitnessSet.to_bytes()),
                auxMetadata
            );

            console.log("UnsignedTx: ", Buffer.from(tx.to_bytes(), "utf8").toString("hex"))

            // Ask wallet to to provide signature (witnesses) for the transaction
            let txVkeyWitnesses;
            txVkeyWitnesses = await this.API.signTx(Buffer.from(tx.to_bytes(), "utf8").toString("hex"), true);
            // Create witness set object using the witnesses provided by the wallet
            txVkeyWitnesses = TransactionWitnessSet.from_bytes(Buffer.from(txVkeyWitnesses, "hex"));
            transactionWitnessSet.set_vkeys(txVkeyWitnesses.vkeys());
            // Build transaction with witnesses
            const signedTx = Transaction.new(
                tx.body(),
                transactionWitnessSet,
                tx.auxiliary_data(),
            );
            
            // console.log("SignedTx: ", Buffer.from(signedTx.to_bytes(), "utf8").toString("hex"))
            console.log("Signed Tx: ", signedTx.to_json());
            
            // Submit built signed transaction to chain, via wallet's submit transaction endpoint
            const result = await this.API.submitTx(Buffer.from(signedTx.to_bytes(), "utf8").toString("hex"));
            console.log("Built and submitted transaction: ", result)
            // Set results so they can be rendered
            const cip95ResultTx = Buffer.from(signedTx.to_bytes(), "utf8").toString("hex");
            const cip95ResultHash = result;
            const cip95ResultWitness = Buffer.from(transactionWitnessSet.to_bytes(), "utf8").toString("hex");
            console.log("cip95ResultWitness: ", cip95ResultWitness)
            this.setState({cip95ResultTx});
            this.setState({cip95ResultHash});
            this.setState({cip95ResultWitness});

        } catch (err) {
            console.log("Error during build, sign and submit transaction");
            console.log(err);
            await this.refreshData();
        }
    }

    async componentDidMount() {
        this.pollWallets();
        await this.refreshData();
    }

    render(){
        return (
            <div style={{margin: "20px"}}>

                <h1>✨buidler fest registration builder dApp✨</h1>                

                <div style={{paddingTop: "10px"}}>
                    <RadioGroup
                        onChange={this.handleWalletSelect}
                        selectedValue={this.state.whichWalletSelected}
                        inline={true}
                        className="wallets-wrapper"
                    >
                        { this.state.wallets.map(key =>
                            <Radio
                                key={key}
                                className="wallet-label"
                                value={key}>
                                <img src={window.cardano[key].icon} width={24} height={24} alt={key}/>
                                {window.cardano[key].name} ({key})
                            </Radio>
                        )}
                    </RadioGroup>
                </div>
                <button style={{padding: "20px"}} onClick={this.refreshData}>Refresh</button>

                <hr style={{marginTop: "10px", marginBottom: "10px"}}/>
                <h3>Wallet Info via CIP-30:</h3>
                <p><span style={{fontWeight: "bold"}}>Network Id (0 = testnet; 1 = mainnet): </span>{this.state.networkId}</p>
                <p><span style={{fontWeight: "bold"}}>.getUTxOs(): </span>{this.state.Utxos?.map(x => <li style={{fontSize: "10px"}} key={`${x.str}${x.multiAssetStr}`}>{`${x.str}${x.multiAssetStr}`}</li>)}</p>
                <p><span style={{fontWeight: "bold"}}>.getBalance(): </span>{this.state.balance}</p>
                <p><span style={{fontWeight: "bold"}}>.getChangeAddress(): </span>{this.state.changeAddress}</p>
                <p><span style={{fontWeight: "bold"}}>.getUsedAddresses(): </span>{this.state.usedAddress}</p>
                
                <hr style={{marginTop: "10px", marginBottom: "10px"}}/>
                <h3>Registration Info:</h3>
                <p><span style={{fontWeight: "bold"}}>Registration address: </span>{this.state.regAddress}</p>
                <p><span style={{fontWeight: "bold"}}>Registration amount: </span>{this.state.regAmount}</p>
                <p><span style={{fontWeight: "bold"}}>Registration metadatum label: </span>{this.state.regLabel}</p>
                <p><span style={{fontWeight: "bold"}}>Registration metadatum text: </span>{this.state.regText}</p>
                
                <h3>"Your ed25519 public key (or its blake2b-224 hash digest)":</h3>
                {/* <p><span style={{fontWeight: "bold"}}>Wallet's stake credential (keyhash): </span>{this.state.stakeCred}</p> */}
                <p><span style={{fontWeight: "bold"}}>Change address' payment credential (keyhash): </span>{this.state.paymentCred}</p>

                <button style={{padding: "10px"}} onClick={ () => this.buildSignSubmitReg() }>😎 Build, sign and submit buidler fest registration</button>
                
                <hr style={{marginTop: "10px", marginBottom: "10px"}}/>

                <p><span style={{fontWeight: "bold"}}>CBORHex Tx: </span>{this.state.cip95ResultTx}</p>
                <p><span style={{fontWeight: "bold"}}>Tx Hash: </span>{this.state.cip95ResultHash}</p>

                <hr style={{marginTop: "10px", marginBottom: "10px"}}/>

            </div>
        )
    }
}

export default App;