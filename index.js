#!js api_version=1.0 name=percolate

const version = "0.0.8";

function log(client, message) { // used for debugging. Sends a pub/sub message to channel myTest and writes to shard log file (/var/opt/redislabs/log/redis-*.log)
   redis.log(message);
   client.call('publish', 'myTest', message);
}

function percolate(client, data) { 
   if (data.event !== 'del') {
        var [id, name, location, coords] = client.call('HMGET', data.key, 'id', 'name', 'location', 'coords');

        log(client, 'Before searchByCoords');

        var policyResults = searchByCoords(client, coords);
      
        policyResults.map(result => {
            log(client, `After searchByCoords and before XADD ${result}`);
            client.call('XADD', `stream:${result}`, '*', 'id', id.toString(), 'name', name, 'location', location, 'coords', coords.toString());
            log(client, `after XADD ${result}`);
        });
   }
}

function searchByCoords(client, coords) {
    var result = null;
    result = client.call('FT.SEARCH', 'policy_idx', '@coords:[CONTAINS $coords]', 'PARAMS', '2', 'coords', coords, 'DIALECT', '3', 'RETURN', '1', 'name');
    var policyMatches = result.results.map((r)=>r.extra_attributes.name);

    return policyMatches;
}

/**
 * result: 
 * 1) “attributes”
   2) (empty array)
   3) “total_results”
   4) (integer) 1
   5) “error”
   6) (empty array)
   7) “results”
   8) 1) 1) “extra_attributes”
      2) 1) “name”
         2) “policy1”
         3) “values”
         4) (empty array)
         5) “id”
         6) “policy:northcarolina”
   9) “format”
   10) “STRING”
 */


redis.registerKeySpaceTrigger('percolate', 'image:', percolate);
//TFCALL percolate.searchCoords 1 "POINT(-78.91659263332907 36.02417253151227)"
redis.registerFunction('searchCoords', searchByCoords);
//TFCALL percolate.getVersion 0
redis.registerFunction('getVersion', () => { return version; });

/*

LOAD FUNCTION:

redis-cli -h <db_endpoint> -p <port> -x TFUNCTION LOAD < ./index.js

REPLACE FUNCTION

redis-cli -h <db_endpoint> -p <port> -x TFUNCTION LOAD REPLACE < ./index.js

COMMANDS TO SETUP INDEX AND HASHES FOR POLYGON SEARCH:

FT.CREATE policy_idx PREFIX 1 policy: SCHEMA coords GEOSHAPE SPHERICAL

HSET policy:northcarolina name policy1 id 1 coords "POLYGON((-84.34383872707907 35.05872718194756,-82.71786216457907 36.07746689729012,-81.72909263332907 36.590781726119666,-75.84042075832907 36.590781726119666,-75.62069419582907 35.66795595984672,-76.14803794582907 35.238389119408744,-76.82919028957907 34.68014855145241,-78.12557700832907 33.86306506075329,-79.70760825832907 34.84260994631683,-80.78426841457907 34.878669039707596,-81.20174888332907 35.16657194640389,-82.21249107082907 35.238389119408744,-83.00350669582907 35.09469129458145,-84.34383872707907 35.05872718194756))"

HSET policy:virginia name policy2 id 2 coords "POLYGON((-83.70663169582907 36.62158040775884,-81.99276450832907 37.51570768537478,-80.47665122707907 37.34122015935666,-79.68563560207907 38.674243869294294,-78.36727622707907 39.42504625010001,-76.71932700832907 38.43368101246521,-76.30184653957907 37.63760681435525,-75.75253013332907 36.62158040775884,-83.70663169582907 36.62158040775884))"

HSET policy:eastcoast name policy3 id 3 coords "POLYGON((-80.65760640521141 25.051574152004545,-88.04041890521141 30.2645796800895,-84.43690328021141 35.430068426141524,-82.41541890521141 37.6192867991881,-78.98768453021141 40.150167723884415,-75.38416890521141 43.997405823920154,-69.23182515521141 47.07446855667766,-66.85877828021141 44.75126583873782,-75.03260640521141 37.68887097555862,-75.12049703021141 35.28671040529606,-80.39393453021141 31.39660537965415,-79.51502828021141 25.44903763976237,-80.65760640521141 25.051574152004545))"

COMMANDS TO TRIGGER FUNCTION:

HSET image:1 name image1 id 1 location "Durham, NC" coords "POINT(-78.91659263332907 36.02417253151227)"

HSET image:2 name image2 id 2 location "Roanoke, VA" coords "POINT(-79.92733482082907 37.29323310448128)"

READ FROM RESULTING STREAMS:

XRANGE stream:policy3 - +

XRANGE stream:policy1 - +

XRANGE stream:policy2 - +

BLOCK AND WAIT FOR NEW STREAM ITEMS:

XREAD BLOCK 0 COUNT 100 STREAMS stream:policy1 stream:policy2 stream:policy3 $ $ $

PLAIN SEARCH COMMAND THAT WORKS:

FT.SEARCH policy_idx '@coords:[CONTAINS $coords]' PARAMS 2 coords 'POINT(-78.91659263332907 36.02417253151227)' DIALECT 3 RETURN 1 name

*/

