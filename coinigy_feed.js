//////////////////// config and includes //////////////////////////////////////////////////////////////
// required for "terminal" style input
var readline = require('readline'),
    util = require('util');
var colors = require("colors/safe");
var moment = require("moment");
var fs = require('fs');

// required to connect to coinigy api
var socketCluster = require('socketcluster-client');
var Client = require('node-rest-client').Client;
var config = require("./config.json");




// socketcluster connection strings (from config.json)
var options = {
    hostname  : config.sc_host,    
    port      : config.sc_port,
    secure    : config.sc_secure
};


var api_credentials =
 {
    "apiKey"    : "", // your api key
    "apiSecret" : "" // your secret key
}



// holds list of currently subscribed channels
var subscribedChannels = [];

// socketcluster client object (init connect)
var SCsocket = socketCluster.connect(options);


// rest client init
var client = new Client();
var rest_credentials = {};
rest_credentials['Content-Type'] = "application/json";
rest_credentials['X-API-KEY'] = api_credentials.apiKey;
rest_credentials['X-API-SECRET'] = api_credentials.apiSecret;



//////////////////// terminal / prompt / command handling ////////////////////////////////////////////
// remove first debugging line from console
process.stdout.write("\x1Bc");


// TO-DO: console output to file


// handles prompt
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer
});

rl.setPrompt("blocktrader> ", 13);
rl.on("line", function (line) {
    handleCommand(line);
    rl.prompt();
});
rl.on('close', function () {
    return process.exit(1);
});
rl.on("SIGINT", function () {
    rl.clearLine();
    rl.question("Confirm exit : ", function (answer) {
        return (answer.match(/^o(ui)?$/i) || answer.match(/^y(es)?$/i)) ? process.exit(1) : rl.output.write("> ");
    });
});
rl.prompt();

var fu = function (type, args) {
    var t = Math.ceil((rl.line.length + 3) / process.stdout.columns);
    var text = util.format.apply(console, args);
    rl.output.write("\n\x1B[" + t + "A\x1B[0J");
    rl.output.write(text + "\n");
    rl.output.write(Array(t).join("\n\x1B[E"));
    rl._refreshLine();
};

console.log = function () {
    fu("log", arguments);
};
console.warn = function () {
    fu("warn", arguments);
};
console.info = function () {
    fu("info", arguments);
};
console.error = function () {
    fu("error", arguments);
};

// autosuggester when hitting tab
function completer(line) {
    var completions = ["help", "exchanges", "subscribe", "unsubscribe", "ticker", "mute", "unmute"];
    var hits = completions.filter(function (c) {
        return c.indexOf(line) == 0;
    });
    
    if (hits.length == 1) {
        return [hits, line];
    } else {
        console.log("Suggest :");
        var list = "",
            l = 0,
            c = "",
            t = hits.length ? hits : completions;
        for (var i = 0; i < t.length; i++) {
            c = t[i].replace(/(\s*)$/g, "")
            if (list != "") {
                list += ", ";
            }
            if (((list + c).length + 4 - l) > process.stdout.columns) {
                list += "\n";
                l = list.length;
            }
            list += c;
        }
        console.log(list + "\n");
        return [hits, line];
    }
}



//////// console output handler ///////////////////////
function pre(msg, type, channel) {
    
    if (!channel) {
        channel = "";
    } else {
        channel = "[" + colors.bold(channel) + "]";
    }
    
    if (typeof msg == "object") {
        msg = JSON.stringify(msg, null, "\t");
    }
    

    if (!type) {
        console.log(colors.cyan('[' +moment().format("MM-DD hh:mm:ss") + '] ' + channel + colors.magenta(msg)));
    }
    if (type == "warning") {
        console.log(colors.cyan('[' +moment().format("MM-DD hh:mm:ss") + '] ' + colors.red(msg)));
    }
    if (type == "info") {
        console.log(colors.cyan('[' +moment().format("MM-DD hh:mm:ss") + '] ' + colors.magenta(msg)));
    }
    if (type == "bold") {
        console.log(colors.cyan('[' +moment().format("MM-DD hh:mm:ss") + '] ' + colors.bold(msg)));
    }
}

/////////// command handler ////////////////////////
function handleCommand(command) {
    
    var res = command.split(" ");
    var method = res[0];
    var command = command.substring(command.indexOf(' ') + 1);
    
    if (!res[1]) {
        switch (method) {
            case "help":
                pre("/// Global Commands ///\n\n\t\thelp - show this menu\n\t\tmute/unmute - hide/show subscription output\n\t\texit - quit\n\n\t\t/// Feed Commands (Websocket API) ///\n\n\t\tsubscriptions - view active channel subscriptions\n\t\texchanges - view list of exchanges\n\t\tchannels <exch_code> - view markets on exchange\n\t\tsubscribe <channelname> - subscribe to a channel\n\t\tunsubscribe <channelname> - unsubscribe from a channel\n\t\tticker - subscribe to ticker shortcut\n\n\t\t/// Account Commands (REST API) ///\n\n\t\taccounts - list account auth_ids\n\t\tbalances <auth_ids> - list balances <by comma-delimited auth_ids>\n\t\trefresh <auth_id> - refresh balances on specific auth_id\n\t\torders <open/history> - get open orders + history\n\n\t\taddalert <exch_code> <market_name> <alert_price> <alert_note> - set alert\n", "bold");
                break;
            case "exchanges":
                socketClusterCommand("exchanges", "");
                break;
            case "channels":
                socketClusterCommand("channels", "");
                break;
            case "mute":
                pre("Output muted.", "bold");
                config.show_output = false;
                break;
            case "unmute":
                pre("Output unmuted.", "bold");
                config.show_output = true;
                break;
            case "ticker":
                socketClusterCommand("subscribe", "ticker");
                break;
            case "subscriptions":
                pre(JSON.stringify(subscribedChannels));
                break;
            case "accounts":
                doRestRequest(rest_credentials, "accounts", {});
                break;
            case "balances":
                doRestRequest(rest_credentials, "balances", {});
                break;
            case "orders":
                doRestRequest(rest_credentials, "orders", {});
                break;
            case "alerts":
                doRestRequest(rest_credentials, "alerts", {});
                break;
            case "exit":
                process.exit(0);
                break;
            default:
                break;
        }
    } else {
        
        switch (method) {
            case "balances":
                doRestRequest(rest_credentials, "balances", { "auth_ids": command });
                break;
            case "refresh":
                doRestRequest(rest_credentials, "refreshBalance", { "auth_id": command });
                break;
            case "history":
                var args = command.split(" ");
                doRestRequest(rest_credentials, "data", { "type": "history", "exchange_code": args[0].toUpperCase(), "exchange_market": args[1].toUpperCase() });
                break;
            case "addalert":
                var args = command.split(" ");
                doRestRequest(rest_credentials, "addAlert", { "exch_code": args[0].toUpperCase(), "market_name": args[1].toUpperCase(), "alert_price": args[2] });
                break;
            default:
                socketClusterCommand(method, command);
                break;
        }
        

        
    }
    
}






//////////////////// Socketcluster handling (Public API) //////////////////////////////////////////////////////////////
// socketcluster subscription and emit event handling
function socketClusterCommand(method, command) {
    
    command = command.toUpperCase();
    pre("Emitting: " + method + " " + command, "info");
    if (command == "") {
        
         SCsocket.emit(method, null, function (err, data) {
            if (!err) {
                for (var i in data[0]) {
                    pre(data[0][i]);
                }
                
                } else {
                    pre(err, "warning");
                }
         });
    } else {
        if (method == "subscribe") {
            var scChannel = SCsocket.subscribe(command);
            
            scChannel.watch(function (data) {
                if (config.show_output == true) {
                    pre(data, "", command);
                }
            });
            subscribedChannels.push(command);
        }
        
        if (method == "unsubscribe") {
            var scChannel = SCsocket.unsubscribe(command);

            var index = subscribedChannels.indexOf(command);
            subscribedChannels.splice(index, 1);
        }
        
        if (method != "subscribe" && method != "unsubscribe") {
            SCsocket.emit(method, command, function (err, data) {
                if (!err) {
                    for (var i in data[0]) {
                        pre(data[0][i]);
                    }
                    
                } else {
                    pre(err, "warning");
                }
            });
        }

    }
}

 
    
// when connection is successfully established, this function is called    
SCsocket.on('connect', function (status) {
    // console.log(status);
    pre('Connected to ' + options.hostname + ':' + options.port + '.');
        
    SCsocket.emit("auth", api_credentials, function (err, msg) {
        
        
        if (typeof err == 'undefined') {
            pre('Successfully authenticated.');
            

        } else {
            pre("Authentication failed.");
        }

        
    });

});

// socketcluster error handling
SCsocket.on('error', function (err) {
    pre(err);
});


// sc connection abort handling
SCsocket.on('connectAbort', function () {
    pre('Connection aborted. Did you enter the right API keys?');

});


// on disconnect handling
SCsocket.on('disconnect', function () {
     pre('Disconnected from server.');
});








///////////////////////// REST API HANDLING (Private API) ///////////////////////////////////////////////////////////
function doRestRequest(rest_credentials, method, args) {
    var postargs = {"data": args, "headers": rest_credentials};
    
    var url = "https://www.coinigy.com/api/v1/" + method; 
    //pre(url);
    //pre(postargs);

    var req = client.post(url, postargs,
	    function (data, response) {
            //console.log(data);
            if (data.data) {
                pre(data.data);
            } else {
                pre(data);
            }
        
        });

    req.on('error', function (err) {
        pre(err);
    });

}












///////////////////////// first run ///////////////////////////////////////////////////////////
pre("\n`..      `..                 `..       `..                    `.. \n" +
"`..      `..                 `..       `..                    `..             \n" +   
"`..      `..   `..       `...`..  `..`.`. `.`. `...`..        `..   `..   `. `... \n" +
"`.. `..  `.. `..  `..  `..   `.. `..   `..   `.. `..  `.. `.. `.. `.   `.. `..   \n" +
"`..   `..`..`..    `..`..    `.`..     `..   `..`..   `..`.   `..`..... `..`..   \n" +
"`..   `..`.. `..  `..  `..   `.. `..   `..   `..`..   `..`.   `..`.        `..   \n" +
"`.. `.. `...   `..       `...`..  `..   `.. `...  `.. `...`.. `..  `....  `... \n", "bold");
pre('blocktrader @0.0.1', "bold");
pre("*** coinigy api account required - see https://www.coinigy.com/bitcoin-api", "bold")
pre('*** Type help for a list of commands.\n', 'bold');
pre("Connecting...");