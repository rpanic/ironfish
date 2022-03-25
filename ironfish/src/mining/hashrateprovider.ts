import { Meter } from "../metrics";
import { StratumClient } from "./stratum";
import { HashrateRequestMessage } from "./stratum/messages";

export class HashrateProvider{

    job: number = -1;

    constructor(request: HashrateRequestMessage, meter: Meter, client: StratumClient){

        this.job = setInterval(() => {

            let hashrate = meter.rate1s
            client.submitHashrate(request.hashrateRequestId, hashrate)

        }, request.period, request.period)

    }

    close(){
        clearInterval(this.job)
        this.job = -1
    }

}