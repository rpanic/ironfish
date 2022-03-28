export class Schema{
    
    statements: string[]

    constructor(){
        this.statements = [
            `CREATE TABLE IF NOT EXISTS block (
                hash VARCHAR(200) UNIQUE PRIMARY KEY,
                height INT,
                reward BIGINT,
                timestamp BIGINT,
                txs INT,
                canonical BOOLEAN NULL,
                graffiti VARCHAR(150) NULL
            )`,
            `CREATE TABLE IF NOT EXISTS submitted_shares (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user VARCHAR(150),
                worker VARCHAR(150),
                randomness BIGINT,
                block INT,
                valid TINYINT,
                target TEXT,
                difficulty BIGINT,
                timestamp BIGINT,
                ip BIGINT UNSIGNED NULL,
                foundBlock TEXT NULL
            );`
            
        ]
    }

}