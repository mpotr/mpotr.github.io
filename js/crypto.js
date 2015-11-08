function log(text)
{
    //TODO: something more adequate
    console.log(text);
}

function isObject(obj)
{
    return obj && (typeof obj === "object");
}

function my_extend(to, from)
{
    for (var i in from)
    {
        if ((i in to) && (isObject(to[i])))
        {
            for (var j in from[i])
            {
                to[i][j] = from[i][j];
            }
        } else {
            to[i] = from[i];
        }
    }
}

len_sid_random = 13;
keylength = "1024";

function Round() {}

Round.prototype.send = function(client) { log(this.name + " send"); return {"status":"DEBUG"};}
Round.prototype.receive = function(peer, msg) { log(this.name + " received from " + peer + ", msg is " + msg); return {"status":"DEBUG"}}
Round.prototype.sended = false;
Round.prototype.received = 0;

round1 = new Round();
round1.name = "round 1";

round1.send = function(client)
{
    var result = {};
    var my_k = new Array(len_sid_random);
    var rnd = new SecureRandom();
    rnd.nextBytes(my_k);
    my_k = my_k.map(function(el){ return String.fromCharCode(el);}).join("");
    var my_k_hashed = sha256.hex(my_k);

    var longterm = new RSAKey();
    longterm.generate(keylength, "03");
    var pub_longterm = cryptico.publicKeyString(longterm);

    var eph = new RSAKey();
    eph.generate(keylength, "03");
    var pub_eph = cryptico.publicKeyString(eph);

    result["update"] = {myLongPubKey: pub_longterm};
    result["update"]["myLongPrivKey"] = longterm;
    result["update"]["myEphPrivKey"] = eph;
    result["update"]["myEphPubKey"] = pub_eph;
    result["update"]["k_i"] = my_k;
    result["status"] = "OK";

    var s = "auth:0:" + my_k_hashed + ":" + pub_longterm + ":" + pub_eph;
    client.sendMessage(s, "mpOTR");
    this.sended = true;
    return result;
}

round1.receive = function(peer, msg)
{
    var result = {};
    result["update"] = {};
    result["update"]["hashedNonceList"] = {};
    result["update"]["longtermPubKeys"] = {};
    result["update"]["ephPubKeys"] = {};
    result["update"]["hashedNonceList"][peer] = msg[0];
    result["update"]["longtermPubKeys"][peer] = msg[1];
    result["update"]["ephPubKeys"][peer] = msg[2];
    result["status"] = "OK";
 
    this.received += 1; //TODO: check peer!
    return result;
}

round2 = new Round();
round2.name = "round 2";

round2.send(client)
{

    result["status"] = "OK";
    return result;
}

round3 = new Round();
round3.name = "round 3";

round4 = new Round();
round4.name = "round 4";

function mpOTRContext(client)
{
    this.rounds = [round1, round2, round3, round4];

    this.receive = function(author, msg)
    {
        var result;
        var msgl = msg.split(":");
        switch (msgl[0]) {
            case "init":
                result = this.rounds[0].send(client);
                if (result["status"] == "OK") {
                    $.extend(this, result["update"]);
                }
                log("init received");
                break;
            case "auth":
                var roundNum = parseInt(msgl[1], 10);
                var round = this.rounds[roundNum];
                result = round.receive(author, msgl.slice(2));
                if (result["status"] == "OK") {
                    my_extend(this, result["update"]);
                }
                if (!round.sended)
                {
                    round.send(client);
                } else if (client.connPool.length === round.received){
                    if (roundNum < 4) {
                        this.rounds[roundNum + 1].send(client);
                    } else {
                        log("auth end now");
                    }
                }
                log(this);
                break;
            case "error":
                //TODO: something more adequate
                log("mpOTR error!");
                break;
            default:
                //TODO: something more adequate
                log("Unexpected mpOTR type"); 
                break;
        }
    }
}
