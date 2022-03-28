import WSWebSocket from 'ws'
import { StratumServer } from './stratum'

export class BackendConnection {

    listen(server: StratumServer){

        const wss = new WSWebSocket.Server({ port: 7654 });

        wss.on('connection', function connection(ws) {

            let consumerClosure: ((a: number) => void) | null = null
            let addrClosure: string | null = null
            ws.on('message', function message(data) {
                console.log('received: %s', data);
                let d = data.toString().split(";")
                if(d[0] === "sub"){

                    let addr = d[1]
                    addrClosure = addr

                    let a = Array.from(server.clients.values()).filter(x => x.publicAddress === addr)
                    
                    a.forEach(client => {
                        let consumer = (hashrate: number) => {

                            ws.send(client.id + ";" + client.workername + ";" + hashrate)
    
                        }
                        consumerClosure = consumer;
                        server.subscribeHashrate(client, consumer)    
                    })

                }

            });

            ws.on('close', () => {
                //TODO Clean up subscribeHashrate

                if(addrClosure && consumerClosure){
                    let a = Array.from(server.clients.values()).filter(x => x.publicAddress === addrClosure)
                    a.forEach(client => {
                        server.cleanupHashrate(client, consumerClosure!)
                    })
                }
            })
        });

    }

}