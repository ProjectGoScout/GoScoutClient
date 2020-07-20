import * as http from 'http';
import { Database } from './database';
import { OpenRequest } from './request';
var Request = require('request');

import * as dotenv from "dotenv";
dotenv.config()

// Destructure Envars
const {
    DB_LOCATION = 'localhost',
    DB_PORT = '3306',
    DB_USER = 'root',
    DB_PASS = 'root',
    DB_NAME = 'rdm',
    SCOUT_LOCATION = 'http://127.0.0.1:5092/scout',
    SCOUT_KEY = 'xxxx-xxxx-xxxx-xxxx',
    CLIENT_ENDPOINT = 'http://xxx.xxx.xxx.xx',
    DATA_ENDPOINT = 'http://xxx.xxx.xxx.xx',
    RDM = true,
    MAD = false,
} = process.env

let db = new Database({
    host: DB_LOCATION,
    port: parseInt(DB_PORT),
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME
})

// default = 3000, will be updated by the server allong the way
let requestRemaining: number = 3000
let keySize: number = 3000

// timestamp in unix time
let lastQueryTimestamp = Math.floor(new Date().getTime() / 1000)
// contains the requests backlog
let openRequests: OpenRequest[] = []
// for an async control loop that fills up a queue, run every 10s
setInterval(async () => {
    // we want a pokemon with iv, that has been seen in the last 5min, highest iv first
    // we limit to 20 per 10s, this should be faster then the api allows at a single key
    // mod this query or logic to your liking, you can also make something that mixes in pvp
    // keep in mind that there is a cap of the number of requests you can perform
    let limit = 10 + ((requestRemaining / keySize) * 10)
    let res = await db.query(`
        SELECT * 
        FROM pokemon 
        WHERE spawn_id is not null
            AND id is not null 
            AND iv is not null 
            AND first_seen_timestamp > ${lastQueryTimestamp}
            AND expire_timestamp > UNIX_TIMESTAMP(NOW() - INTERVAL 180 SECOND)
        ORDER BY iv desc
        LIMIT ${limit}`, [])
    console.log(`[query] found ${res.length} records`)
    res.forEach(row => {
        openRequests.push(<OpenRequest>{
            pokemon_id: row.pokemon_id,
            iv: row.iv,
            lat: row.lat,
            lng: row.lon,
            enc_id: row.id,
            spawn_id: row.spawn_id
        })
    })
    lastQueryTimestamp = Math.floor(new Date().getTime() / 1000)
}, 10 * 500)

let outstandingRequest: OpenRequest[] = []
setInterval(async () => {
    if (openRequests.length > 0) {
        let request = openRequests.shift()!

        // set the callback; so this client can keep track and display what you received
        request.callback = CLIENT_ENDPOINT

        // if you use RDM; the GOSCOUT will send the data directly to your RDM setup
        if (RDM) {
            request.type = 'RDM'
        }

        // if you use MAD the GOSCOUT will send json data to your MAD setup
        if (MAD) {
            request.type = 'MAD'
        }

        // send to GOSCOUT
        Request({
            method: 'post',
            url: SCOUT_LOCATION,
            body: request,
            headers: {
                "Authorization": "GOSCOUTKEY " + SCOUT_KEY
            },
            json: true,
        }, function (error: any, response: any, body: any) {
            // you could be debugging.. turn this on; it might spam, allot, but you can see what you are sending / receiving back
            //console.log(body, error, response);  
        });

        // push to a list of already requested pokemon
        outstandingRequest.push(request!)
    } else {
        console.log('there are no open request to be send')
    }
}, 1 * 1000) // send every 500ms, set slower or faster depending on your key


// manage the outstanding list
function removeFromOutstanding(enc_id: string) {
    for (let index = outstandingRequest.length - 1; index >= 0; index--) {
        let request = outstandingRequest[index]
        // remove based on enc id
        if (request.enc_id == enc_id) {
            outstandingRequest.splice(index, 1)
            continue
        }
        // removes based on time
        if (request.added_at + 300 < Math.floor(new Date().getTime() / 1000)) {
            // its been 5 min now, lets remove, this aint coming
            outstandingRequest.splice(index, 1)
        }
    }
}
setInterval(() => {
    // call every minute to clean the outstanding list
    removeFromOutstanding('')
}, 60 * 1000)


// create the http server to serve up the dashboard and stats json
// and provide an endpoint to which the goscout can report found iv
var httpServer = http.createServer(function (req, res) {
    let incomingData: Array<Buffer> = [];

    if (req.url == '/dashboard') {

        // serve up a static html file that will serve as the dashboard, this file will be calling the /dashboard_api to fetch data
        res.end('')

    } else if (req.url && req.url.startsWith('/callback')) {
        req.on('data', chunk => {
            incomingData.push(chunk)
        })
        req.on('end', () => {
            let data = JSON.parse(incomingData.join(''));
            // infer enc_id, mark completed in the cache
            removeFromOutstanding(data.encounter.encounter_id)
            // send to GOSCOUT
            Request(
                {
                    method: 'post',
                    url: DATA_ENDPOINT,
                    form: data,
                    json: true,
                }, function (error: any, response: any, body: any) {
                    // you could be debugging.. turn this on; it might spam, allot, but you can see what you are sending / receiving back
                    //console.log(body, error, response);  
                }
            );
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('');
        });
    } else if (req.url && req.url.startsWith('/dashboard_api')) {
        res.writeHead(200, { "Content-Type": "application/json" });

        // write a bunch of recorded stats as json

        res.end(JSON.stringify([]));
    } else {
        res.end('404');
    }

});

httpServer.keepAliveTimeout = 0;
httpServer.listen('8888', function () {
    console.log(`server start at port 8888`);
});
