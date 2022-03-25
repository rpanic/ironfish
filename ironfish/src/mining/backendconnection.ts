import WSWebSocket from 'ws'
import { StratumServer } from './stratum'

export class BackendConnection {

    listen(server: StratumServer){

        const wss = new WSWebSocket.Server({ port: 7654 });

        wss.on('connection', function connection(ws) {

            ws.on('message', function message(data) {
                console.log('received: %s', data);
                let d = data.toString().split(";")
                if(d[0] === "sub"){

                    let addr = d[1]
    
                    let a = Array.from(server.clients.values()).filter(x => x.publicAddress === addr)
                    //TODO forEach
                    server.subscribeHashrate(a[0], (hashrate) => {

                        ws.send(hashrate)

                    })    

                }

            });

            ws.on('close', () => {
                //Clean up subscribeHashrate
            })
        });

    }

}