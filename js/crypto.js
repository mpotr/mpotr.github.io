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

var len_sid_random = 13;
var keylength = "1024";
var auth_key_length = "1024"
var exp = "03";
var mod = new BigInteger("239", 10); // TODO: make it BIGGER
var random = new SecureRandom();


function Round() {}

Round.prototype.send = function(client, context) { log(this.name + " send with context " + context); return {"status":"DEBUG"};}
Round.prototype.receive = function(peer, msg, context) { log(this.name + " received from " + peer + ", msg is " + msg); return {"status":"DEBUG"}}
Round.prototype.sended = false;
Round.prototype.received = 0;

round1 = new Round();
round1.name = "round 1";

var generate_pair = function(length)
{
    var a = new RSAKey();
    a.generate(length, exp);
    var b = cryptico.publicKeyString(a);
    return [a, b];
}

var generate_number = function()
{
    var a = new Array(len_sid_random);
    random.nextBytes(a);
    return new BigInteger(a);
};

var generate_exp_pair = function(length)
{
    var nn = generate_number();
    var a = nn.mod(mod);
    var b = a.modPowInt(parseInt(exp, 10), mod);
    return [a, b];
};

round1.send = function(client, context)
{
    var result = {};
    var my_k = new Array(len_sid_random);
    random.nextBytes(my_k);

    my_k = my_k.map(function(el){ return String.fromCharCode(el);}).join("");
    var my_k_hashed = sha256.hex(my_k);

    var long_pair = generate_exp_pair(keylength);
    var longterm = long_pair[0];
    var pub_longterm = long_pair[1];

    var eph_pair = generate_pair(keylength);
    var eph = eph_pair[0];
    var pub_eph = eph_pair[1];

    result["update"] = { myLongPubKey: pub_longterm };
    result["update"]["myLongPrivKey"] = longterm;
    result["update"]["myEphPrivKey"] = eph;
    result["update"]["myEphPubKey"] = pub_eph;
    result["update"]["k_i"] = my_k;

    result["update"]["hashedNonceList"] = {};
    result["update"]["longtermPubKeys"] = {};
    result["update"]["ephPubKeys"] = {};
    result["update"]["hashedNonceList"][client.peer] = my_k_hashed;
    result["update"]["longtermPubKeys"][client.peer] = pub_longterm;
    result["update"]["ephPubKeys"][client.peer] = pub_eph;
 
    result["status"] = "OK";

    var s = "auth:0:" + my_k_hashed + ":" + pub_longterm + ":" + pub_eph;
    client.sendMessage(s, "mpOTR");
    this.sended = true;
    return result;
};

round1.receive = function(peer, msg, context)
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
};

round2 = new Round();
round2.name = "round 2";

round2.send = function(client, context)
{
    var result = {
        "update": {},
        "status": "FAIL"
    };
    var sid_raw = "";

    var hn = context.hashedNonceList;
    for(var i in hn) {
        sid_raw = sid_raw + hn[i];
    };

    var sid = sha256.hex(sid_raw);
    result.update.sid = sid;

    var auth_pair = generate_exp_pair(auth_key_length);
    var r_i = auth_pair[0];
    var exp_r_i = auth_pair[1];
    result.update.r_i = r_i;
    result.update.exp_r_i = exp_r_i;

    result["status"] = "OK";
    var s = "auth:1:" + sid + ":" + exp_r_i;
    result["update"]["expAuthNonce"] = {};
    result["update"]["expAuthNonce"][client.peer] = exp_r_i;
    client.sendMessage(s, "mpOTR");
    this.sended = true;
    return result;
};

round2.receive = function(peer, msg, context)
{
    var result = {
        "update": {},
        "status": "OK"
    }
    if ((msg[0] != context.sid) && (context.sid !== undefined)) // sid can be still undefined;
    {                                                           // in that case this check will fail
        result["status"] = "WRONG SESSION ID";                  // in another place. TODO: check in sid generation
    } else {
        result["update"]["expAuthNonce"] = {};
        result["update"]["expAuthNonce"][peer] = msg[1];
    }
    this.received += 1;
    return result;
};

round3 = new Round();
round3.name = "round 3";

round3.send = function(client, context)
{
    var result = {
        "update": {},
        "status": "OK"
    }

    return result;
}

round3.receive = function(peer, msg, context)
{
    var result = {
        "update": {},
        "status": "OK"
    }

    return result;
}

round4 = new Round();
round4.name = "round 4";

round4.send = function(client, context)
{
    var result = {
        "update": {},
        "status": "OK"
    }

    return result;
}

round4.receive = function(peer, msg, context)
{
    var result = {
        "update": {},
        "status": "OK"
    }

    return result;
};

var process = function(context, callback)
{
    var result = callback(context);
    if (result["status"] === "OK") {
        my_extend(context, result["update"]);
    } else {
        log("mpOTR error: " + result["status"]); // TODO something more adequate
    }
};

function mpOTRContext(client)
{
    this.rounds = [round1, round2, round3, round4];

    this.receive = function(author, msg)
    {
        var result;
        var msgl = msg.split(":");
        switch (msgl[0]) {
            case "init":
                process(this, function(context) {
                    return context.rounds[0].send(client, this);
                });
                log("init received");
                break;
            case "auth":
                var roundNum = parseInt(msgl[1], 10);
                var round = this.rounds[roundNum];
                process(this, function(context) {
                    return round.receive(author, msgl.slice(2), context);
                });
                if (!round.sended)
                {
                    process(this, function(context) {
                        return round.send(client, context);
                    });
                } else if (client.connPool.length === round.received){
                    if (roundNum < 4) {
                        process(this, function(context) {
                            return context.rounds[roundNum + 1].send(client, context);
                        });
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
