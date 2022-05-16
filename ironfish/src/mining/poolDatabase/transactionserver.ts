import express from 'express';
import { Server } from 'http';
import { MiningPoolShares } from '../poolShares';

export class TransactionServer{

    server: Server | undefined = undefined

    constructor(private node: MiningPoolShares){}

    async start(){

        let app = express()
        app.use(express.json());
        app.post("/sendMiningPayoutTransaction", async (req, res) => {

            try{
                let body = req.body
                if(body["password"] === "asdfgoijasvhjwoieho23h09823hf9823hf9823hf90823hf9823hf3wf"){

                    let payouts = body["payouts"] as WithdrawRequest[]
                    let numShares = body["numShares"] as number
                    if(!numShares){
                        numShares = 0
                    }
                    let payoutId = body["payoutId"] as number
                    if(!payoutId){
                        payoutId = 0
                    }

                    console.log(payouts)
                    if(payouts.length > 0){

                        this.node.createPayout2(payouts, numShares, payoutId).then(x => {
                            res.send(x)
                        }).catch(e => res.send(e))

                    }else{
                        res.status(500).send("Nothing sent")
                    }

                }else{
                    res.status(500).send("Fail")
                }
            }catch(e){
                console.log(e)
                res.status(500).send("Exception")
            }

        })

        app.get("/status", async (req, res) => {

            const result = await this.node.rpc.status()

            res.send(result.content)

        })

        app.get("/block", async (req, res) => {
            let hash = req.query["block"]?.toString()
            console.log(hash)

            try{
                if(hash !== undefined){
                    const result = await this.node.rpc.getBlockInfo({ hash })
                    res.send(result.content)
                }else{
                    res.send("No hash provided")
                }
            }catch(e){
                console.log(e)
                res.send("fail")
            }
        })

        app.post("/sendText", async (req, res) => {
            let text = req.body["text"]?.toString()
            this.node.discord?.sendText(text)
        })

        const hostname = '0.0.0.0';
        const port = 5050;
        
        this.server = app.listen(port, hostname, () => {
            console.log(`Server running at http://${hostname}:${port}/`);
        })
    }

    stop(){
        this.server?.close()
    }
}

export interface WithdrawRequest{
    publicAddress: string;
    dbId: number;
    amount: string;
}