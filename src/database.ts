import mysql from 'mysql';

export class Database {
    connection = <any>{}
    constructor( config: mysql.ConnectionConfig ) {
        this.connection = mysql.createConnection( config );
    }
    query( sql: string, args: string[] ): Promise<Array<any>> {
        return new Promise( ( resolve, reject ) => {
            this.connection.query( sql, args, ( err: Error, rows: any[] ) => {
                if ( err )
                    return reject( err );
                resolve( rows );
            } );
        } );
    }
    close() {
        return new Promise( ( resolve, reject ) => {
            this.connection.end( (err: Error) => {
                if ( err )
                    return reject( err );
                resolve();
            } );
        } );
    }
}