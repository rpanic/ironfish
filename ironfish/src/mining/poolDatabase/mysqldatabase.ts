/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Config } from '../../fileStores/config'
import { NodeFileProvider } from '../../fileSystems/nodeFileSystem'
import mysql, { RowDataPacket } from 'mysql2'
import { Schema } from './mysql/schema'
import { Target } from '../../primitives/target'
import { SerializedBlockTemplate } from '../../serde/BlockTemplateSerde'
import { mineableHeaderString } from '../utils'
import { blake3 } from '@napi-rs/blake-hash'
import { WithdrawRequest } from './transactionserver'

export class MysqlDatabase {
    private readonly db: MySqlConnector
    private readonly config: Config
    private readonly attemptPayoutInterval: number
    private readonly successfulPayoutInterval: number

    constructor(options: { db: MySqlConnector, config: Config }) {
        this.db = options.db
        this.config = options.config
        this.attemptPayoutInterval = this.config.get('poolAttemptPayoutInterval')
        this.successfulPayoutInterval = this.config.get('poolSuccessfulPayoutInterval')
    }

    static async init(options: { config: Config }): Promise<MysqlDatabase> {
        const fs = new NodeFileProvider()
        await fs.init()

        const poolFolder = fs.join(options.config.dataDir, '/pool')
        await fs.mkdir(poolFolder, { recursive: true })

        const db = new MySqlConnector(options.config)
        db.init();

        return new MysqlDatabase({
            db,
            config: options.config,
        })
    }

    async start(): Promise<void> {
    }

    async stop(): Promise<void> {
        await this.db.close()
    }

    async newShare(share: SubmittedShare): Promise<void> {
        return this.db.insertShare(share);
    }

    async newBlock(block: SerializedBlockTemplate, share: SubmittedShare) : Promise<void>{
        return this.db.insertBlock(block, share)
    }
    
    // async getSharesForPayout(timestamp: number): Promise<DatabaseShare[]> {
    //     return await this.db.all(
    //         "SELECT * FROM share WHERE payoutId IS NULL AND createdAt < datetime(?, 'unixepoch')",
    //         timestamp,
    //     )
    // }

    // async newPayout(timestamp: number): Promise<number | null> {
    //     // Create a payout row if the most recent succesful payout was greater than the payout interval
    //     // and the most recent payout was greater than the attempt interval, in case of failed or long
    //     // running payouts.
    //     const successfulPayoutCutoff = timestamp - this.successfulPayoutInterval
    //     const attemptPayoutCutoff = timestamp - this.attemptPayoutInterval

    //     const query = `
    //     INSERT INTO payout (succeeded)
    //       SELECT FALSE WHERE
    //         NOT EXISTS (SELECT * FROM payout WHERE createdAt > datetime(?, 'unixepoch') AND succeeded = TRUE)
    //         AND NOT EXISTS (SELECT * FROM payout WHERE createdAt > datetime(?, 'unixepoch'))
    //   `

    //     const result = await this.db.run(query, successfulPayoutCutoff, attemptPayoutCutoff)
    //     if (result.changes !== 0 && result.lastID != null) {
    //         return result.lastID
    //     }

    //     return null
    // }

    async markPayoutSuccess(requests: WithdrawRequest[], tx: string): Promise<void> {
        this.db.markPayoutSuccess(requests, tx);
    }

    async shareCountSince(timestamp: number): Promise<number> {
        return await this.db.shareCountSince(timestamp * 1000);
    //     const result = await this.db.get<{ count: number }>(
    //         "SELECT COUNT(id) AS count FROM share WHERE createdAt > datetime(?, 'unixepoch')",
    //         timestamp,
    //     )
    //     if (result == null) {
    //         return 0
    //     }
    //     return result.count
    }
}

export type DatabaseShare = {
    id: number
    publicAddress: string
    createdAt: Date
    payoutId: number | null
}

export type MineReq = { miningRequestId: number; bytes: Buffer; target: Target; sequence: number }

export type ShareSubmission = {randomness: number, requestId: number, user: string | undefined, worker: string | undefined}

export type SubmittedShare = { user: string, worker: string, valid: number, randomness: number, block: number, blockHash: string, difficulty: bigint, error: string | null }

export type User = { address: string }

export class MySqlConnector {

    connection: mysql.Connection

    constructor(config: Config) {

        let params = config.get("mysqlParams").split(":")

        console.log(`Logging in to DB with credentials ${params}`)

        this.connection = mysql.createConnection({
            host: params[0],
            user: params[1],
            password: params[2],
            database: params[3]
        });
        
    }

    init(){

        console.log("Database connected")

        new Schema().statements.forEach(statement => {
            this.connection.query(
                statement,
                function (err, results, fields) {
                    if (err != null) {
                        console.log("Error in Create Table: " + err.message)
                        console.log(err)
                    }
                }
            )
        })

        console.log("Database init complete")
    }

    handleDbError(err: mysql.QueryError | null) {
        if (err != null) {
            console.log(err)
        }
    }

    insertShare(share: SubmittedShare) {

        let username = ""
        let graffiti = ""
        let user = share.user

        if (user.includes(":")) {
            let index = user.indexOf(":")
            username = user.substring(0, index)
            graffiti = user.substring(index + 1, user.length)
        } else {
            username = user
            graffiti = "default"
        }

        this.connection.execute(
            `INSERT INTO submitted_shares(user, worker, randomness, block, valid, difficulty, timestamp, foundBlock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [username, share.worker, share.randomness, share.block, share.valid, share.difficulty, new Date().getTime(), share.blockHash && share.blockHash.length > 0 ? share.blockHash : null],
            this.handleDbError
        )

    }

    insertBlock(block: SerializedBlockTemplate, submission: SubmittedShare) {

        let fee = parseInt(block.header.minersFee, 16).toString()
        // block.header.minersFee.fee().then(fee => {
        let hash = this.calculateHash(block);

        this.connection.execute(
            `INSERT INTO block(hash, height, reward, timestamp, txs, graffiti) VALUES (?, ?, ?, ?, ?, ?)`,
            [hash.toString('hex'), block.header.sequence, fee, new Date().getTime(), block.transactions.length, block.header.graffiti],
            this.handleDbError
        )

        this.connection.execute(
            `UPDATE submitted_shares SET foundBlock = ? WHERE randomness = ? AND user = ? LIMIT 1`,
            [hash.toString('hex'), submission.randomness, submission.user],
            this.handleDbError
        )

        // })

    }

    setCanoncial(block: SerializedBlockTemplate, canonical: boolean) {

        let hash = this.calculateHash(block);
        this.connection.execute(
            `UPDATE block SET canonical = ? WHERE block.hash = ? LIMIT 1`,
            [canonical, hash.toString('hex')],
            (err) => {
                if (err != null) {
                    console.log("Block " + hash.toString('hex') + " set as " + (!canonical ? 'non-' : '') + "canonical")
                } else {
                    this.handleDbError(err)
                }
            }
        )

    }

    markPayoutSuccess(requests: WithdrawRequest[], tx: string) {
        

    }

    shareCountSince(timestamp: number) : Promise<number>{
        return new Promise((resolve) => {
            this.connection.query<RowDataPacket[]>("SELECT COUNT(id) AS count FROM submitted_shares WHERE timestamp > ?", [timestamp], (err, rows) => {
                let n = 0
                if(rows.length > 0){
                    n = rows[0]["count"] as number
                }
                resolve(n)
            })
         })
    }

    calculateHash(block: SerializedBlockTemplate) : Buffer{
        
        const headerBytes = mineableHeaderString(block.header)
        const hash = blake3(headerBytes)
        return hash
    }

    calculateShareId(submission: ShareSubmission) {
        submission.requestId + (submission.user !== undefined ? submission.user : "default") + submission.randomness
    }

    close(){
        this.connection.end()
    }

    //Function that checks if the connection is still active. If not, it will reconnect.
    async ping(){
        try{
            await this.connection.ping()
        }catch(e){
            console.log("Database connection lost. Reconnecting...")
            this.connection = mysql.createConnection(this.connection.config)
            this.init()
        }
    }

}