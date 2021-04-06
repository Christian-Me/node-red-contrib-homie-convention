var ip = require('internal-ip');
var macaddress = require('macaddress');
var os = require('os');
require('loadavg-windows');

var mqtt = require('mqtt');
const { exit } = require('process');

module.exports = function (RED) {
  function homieDeviceConfig (config) {
    RED.nodes.createNode(this, config);
    var node = this;
    this.latestHomieVersion = '4.0.0';
    this.homieConvention = {
      "3.0.0,3.0.1":{
        "knownLimitations":"Arrays are not supported (dropped in since Version 4.0.0), broadcast not supported (use standard mqtt node instead)",
        "releaseDate":"27. October 2018",
        "deviceId": {"$datatype":"string", "required":true},
        "$homie": {"$datatype":"string", "required":true, "default":"3.0.1", "description":"Version of the homie convention"},
        "$name": {"$datatype":"string", "required":true,"default":"N/A", "description":"Human readable name of the device"},
        "$state": {"$datatype":"enum", "required":true, "default":"lost", "$format":"init,ready,disconnected,sleeping,lost,alert", "description":"Representation of the current state of the device. There are 6 different states"},
        "$extensions": {"$datatype":"enum", "required":false, "default":"", "description":"A comma separated list of used extensions."},
        "$implementation": {"$datatype":"string", "required":false, "default":"N/A", "description":"An identifier for the Homie implementation"},
        "$stats": {
          "interval":{"$datatype":"integer","$unit":"sec","required":true,"default":60,"$format":"","icon":"fa fa-undo","description":"Interval in seconds at which the device refreshes its $stats/+"},
          "uptime":{"$datatype":"integer","$unit":"sec","required":true,"default":0,"$format":"","icon":"fa fa-clock-o","description":"Time elapsed in seconds since the boot of the device"},
          "signal":{"$datatype":"integer","$unit":"%","required":false,"default":0,"$format":"0:100","icon":"fa fa-wifi","description":"Signal strength"},
          "cputemp":{"$datatype":"float","$unit":"°C","required":false,"default":0,"$format":"","icon":"fa fa-thermometer-half","description":"CPU Temperature"},
          "cpuload":{"$datatype":"integer","$unit":"%","required":false,"default":0,"$format":"0:100","icon":"fa fa-microchip","description":"CPU Load. Average of last $stats/interval including all CPUs"},
          "battery":{"$datatype":"integer","$unit":"%","required":false,"default":0,"$format":"0:100","icon":"fa fa-battery-half","description":"Battery level"},
          "freeheap":{"$datatype":"integer","$unit":"bytes","required":false,"default":0,"$format":"","icon":"fa fa-braille","description":"Free heap in bytes"},
          "supply":{"$datatype":"float","$unit":"V","required":false,"default":0,"$format":"","icon":"fa fa-plug","description":"Supply Voltage in V"},
        },
        "$localip":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","icon":"fa fa-address-card-o","name":"IP on local network","description":"IP of the device on the local network"},
        "$mac":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","icon":"fa fa-barcode","description":"Mac address of the device network interface; The format MUST be of the type A1:B2:C3:D4:E5:F6"},
        "$fw":{
          "name":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","icon":"fa fa-file-code-o","description":"Name of the firmware running on the device; Allowed characters are the same as the device ID"},
          "version":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","icon":"fa fa-code-fork","description":"Version of the firmware running on the device"},
          "*":{"$datatype":"string","$unit":"","required":false,"default":"","$format":"","icon":"fa fa-tags","description":"Additional parameters"} 
        },
        "$nodes": {"$datatype":"object", "required":true, "default":"", "description":"Comma separated list of nodes included in this device"},
        "_nodes":{
          "nodeId": {"$datatype":"string", "required":true},
          "$name": {"$datatype":"string", "required":true, "description":"Human readable name of the node"},
          "$type": {"$datatype":"string", "required":true, "default":"", "description":"Description of the node type"},
          "$properties": {"$datatype":"object", "required":true, "default":"", "description":"Comma separated list of properties included in this node"},
          "_properties": {
            "propertyId":{"$datatype":"string", "required":true},
            "$name":{"$datatype":"string", "required":true, "description":"Human readable name of the property"},
            "$datatype":{"$datatype":"enum", "required":true, "format":"string,integer,float,boolean,enum,color,datetime,duration", "description":"Type of Property; string, integer, float, boolean, enum, color, datetime, duration"},
            "$format":{"$datatype":"string", "required":false, "description":"Specifies restrictions or options for the given data type"},
            "$settable":{"$datatype":"boolean", "required":false, "default":false, "description":"Settable (true). Default is read-only (false)"},
            "$retained":{"$datatype":"boolean", "required":false, "default":true, "description":"Non-retained (false). Default is Retained (true)."},
            "$unit":{"$datatype":"string", "required":false, "default":"", "description":"Unit of the property"}
          }
        }
      },
      "4.0.0":{
        "knownLimitations":"broadcast not supported (use standard mqtt node instead)",
        "releaseDate":"18. July 2019",
        "deviceId": {"$datatype":"string", "required":true},
        "$homie": {"$datatype":"string", "required":true, "default":"3.0.1", "description":"Version of the homie convention"},
        "$name": {"$datatype":"string", "required":true,"default":"N/A", "description":"Human readable name of the device"},
        "$state": {"$datatype":"enum", "required":true, "default":"lost", "$format":"init,ready,disconnected,sleeping,lost,alert", "description":"Representation of the current state of the device. There are 6 different states"},
        "$extensions": {"$datatype":"enum", "required":false, "default":"", "description":"A comma separated list of used extensions."},
        "$implementation": {"$datatype":"string", "required":false, "default":"N/A", "description":"An identifier for the Homie implementation"},
        "$nodes": {"$datatype":"object", "required":true, "default":"", "description":""},
        "_nodes":{
          "nodeId": {"$datatype":"string", "required":true},
          "$name": {"$datatype":"string", "required":true, "description":"Human readable name of the node"},
          "$type": {"$datatype":"string", "required":true, "default":"", "description":"Description of the node type"},
          "$properties": {"$datatype":"object", "required":true, "default":"", "description":""},
          "_properties": {
            "propertyId":{"$datatype":"string", "required":true},
            "$name":{"$datatype":"string", "required":true, "description":"Human readable name of the property"},
            "$datatype":{"$datatype":"enum", "required":true, "format":"string,integer,float,boolean,enum,color,datetime,duration", "description":"Type of Property; string, integer, float, boolean, enum, color, datetime, duration"},
            "$format":{"$datatype":"string", "required":false, "description":"Specifies restrictions or options for the given data type"},
            "$settable":{"$datatype":"boolean", "required":false, "default":false, "description":"Settable (true). Default is read-only (false)"},
            "$retained":{"$datatype":"boolean", "required":false, "default":true, "description":"Non-retained (false). Default is Retained (true)."},
            "$unit":{"$datatype":"string", "required":false, "default":"", "description":"Unit of the property"}
          }
        }
      }
    };
    this.icons = {
      "$type":{
        'icon':"fa fa-cogs"
      },
      "$format":{
        'icon':"fa fa-arrows-h"
      },
      "$unit":{
        'icon':"fa fa-thermometer-half"
      },
      "$name":{
        'icon':"fa fa-info"
      },
      "$datatype":{
        'icon':"fa fa-edit",
        'values':{
          'integer':"fa fa-signal",
          'float':"fa fa-sliders",
          'boolean':"fa fa-toggle-on",
          'string':"fa fa-font",
          'enum':"fa fa-list-ol",
          'color':"fa fa-paint-brush",
          'datetime':"fa fa-calendar-o",
          'duration':"fa fa-clock-o"
        }
      },
      "$settable":{
        'icon':"fa fa-bolt",
        'values':{
          'true':"fa fa-bolt",
          'false':"fa fa-arrow-circle-right"
        }
      },
      "$retained":{
        'icon':"fa fa-database"
      }
    }
    this.homieExtensions = {
      "org.homie.legacy-stats": {
        "name": "Legacy Stats",
        "description":"Adds the stats functionality of Homie 3.0.1 to Homie 4.0",
        "url":"https://github.com/homieiot/convention/blob/develop/extensions/documents/homie_legacy_stats_extension.md",
        "version":"0.1.1",
        "homie":"4.x",
        "_definition": {
          "$stats": {
            "interval":{"$datatype":"integer","$unit":"sec","required":true,"default":60,"$format":"","icon":"fa fa-undo","description":"Interval in seconds at which the device refreshes its $stats/+"},
            "uptime":{"$datatype":"integer","$unit":"sec","required":true,"default":0,"$format":"","icon":"fa fa-clock-o","description":"Time elapsed in seconds since the boot of the device"},
            "signal":{"$datatype":"integer","$unit":"%","required":false,"default":0,"$format":"0:100","icon":"fa fa-wifi","description":"Signal strength"},
            "cputemp":{"$datatype":"float","$unit":"°C","required":false,"default":0,"$format":"","icon":"fa fa-thermometer-half","description":"CPU Temperature"},
            "cpuload":{"$datatype":"integer","$unit":"%","required":false,"default":0,"$format":"0:100","icon":"fa fa-microchip","description":"CPU Load. Average of last $stats/interval including all CPUs"},
            "battery":{"$datatype":"integer","$unit":"%","required":false,"default":0,"$format":"0:100","icon":"fa fa-battery-half","description":"Battery level"},
            "freeheap":{"$datatype":"integer","$unit":"bytes","required":false,"default":0,"$format":"","icon":"fa fa-braille","description":"Free heap in bytes"},
            "supply":{"$datatype":"float","$unit":"V","required":false,"default":0,"$format":"","icon":"fa fa-plug","description":"Supply Voltage in V"},
          }
        },
      },
      "org.homie.legacy-firmware": {
        "name":"Legacy Firmware",
        "description":"Adds the firmware, mac and localip device attributes of Homie 3.0.1 to Homie 4.0.",
        "url":"https://github.com/homieiot/convention/blob/develop/extensions/documents/homie_legacy_firmware_extension.md",
        "version":"0.1.1",
        "homie":"4.x",
        "_definition": {
          "$localip":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","icon":"fa fa-address-card-o","name":"IP on local network","description":"IP of the device on the local network"},
          "$mac":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","icon":"fa fa-barcode","description":"Mac address of the device network interface; The format MUST be of the type A1:B2:C3:D4:E5:F6"},
          "$fw":{
            "name":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","icon":"fa fa-file-code-o","description":"Name of the firmware running on the device; Allowed characters are the same as the device ID"},
            "version":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","icon":"fa fa-code-fork","description":"Version of the firmware running on the device"},
            "*":{"$datatype":"string","$unit":"","required":false,"default":"","$format":"","icon":"fa fa-tags","description":"Additional parameters"} 
          }
        }
      }
    };
    this.homieNodeDef = {
      "nodeId": {"type":"string", "required":true},
      "$name": {"type":"string", "required":true},
      "$type": {"type":"string", "required":true},
      "$properties": {"type":"object", "required":false},
      "_properties": {
        "propertyId":{"type":"string", "required":true},
        "$name":{"type":"string", "required":true},
        "$datatype":{"type":"enum", "required":true,"default":"string", "format":"string,integer,float,boolean,enum,color"},
        "$format":{"type":"string", "required":false},
        "$settable":{"type":"boolean", "required":false, "default":false},
        "$retained":{"type":"boolean", "required":false, "default":true},
        "$unit":{"type":"string", "required":false, "default":""}
      }
    };
    this.homieExDef = {
      "$state":{"icon":"fa fa-bolt","type":"enum","unit":"","required":true,"default":"lost","format":
        {
          "init":"fa fa-cog fa-spin",
          "ready":"fa fa-spinner fa-spin",
          "disconnected":"fa fa-times",
          "sleeping":"fa fa-moon-o",
          "lost":"fa fa-question-circle",
          "alert":"fa fa-exclamation-triangle"
        }
      },
      "$homie":{"icon":"fa fa-label","type":"string","unit":"","required":true,"default":"n/a","format":""},
      "$nodes":{"icon":"fa fa-labels","type":"array","unit":"","required":true,"default":"n/a","format":""},
      "$extensions":{"icon":"fa fa-labels","type":"string","unit":"","required":true,"default":"n/a","format":""},
      "$type":{"icon":"fa fa-cogs","type":"string","unit":"","required":true,"default":"n/a","format":""},
      "$implementation":{"icon":"fa fa-code","type":"string","unit":"","required":false,"default":"n/a","format":""},
      "$localip":{"icon":"fa fa-address-card-o","type":"string","unit":"","required":true,"default":"n/a","format":""},
      "$mac":{"icon":"fa fa-barcode","type":"string","unit":"","required":true,"default":"n/a","format":""},
      "$fw":{
        "name":{"icon":"fa fa-file-code-o","type":"string","unit":"","required":true,"default":"n/a","format":""},
        "version":{"icon":"fa fa-code-fork","type":"string","unit":"","required":true,"default":"n/a","format":""},
        "*":{"icon":"fa fa-tags","type":"string","unit":"","required":false,"default":"","format":""} 
      },
      "$stats": {
        "interval":{"icon":"fa fa-undo","type":"integer","unit":"sec","required":true,"default":0,"format":""},
        "uptime":{"icon":"fa fa-clock-o","type":"integer","unit":"sec","required":true,"default":0,"format":""},
        "signal":{"icon":"fa fa-wifi","type":"integer","unit":"%","required":false,"default":0,"format":"0:100"},
        "cputemp":{"icon":"fa fa-thermometer-half","type":"float","unit":"°C","required":false,"default":0,"format":""},
        "cpuload":{"icon":"fa fa-microchip","type":"integer","unit":"%","required":false,"default":0,"format":"0:100"},
        "battery":{"icon":"fa fa-battery-half","type":"integer","unit":"%","required":false,"default":0,"format":"0:100"},
        "freeheap":{"icon":"fa fa-braille","type":"integer","unit":"bytes","required":false,"default":0,"format":""},
        "supply":{"icon":"fa fa-plug","type":"float","unit":"V","required":false,"default":0,"format":""},
      }
    };
        
    // ------------------------------------------
    // Handle console Logs
    // ------------------------------------------
    
    // collect a log entry
    this.addToLog = function(type,text,collect) {
      if (!node.log[type] && !collect) { // send at once
        node.log[type]=text;
        return node.sendLog(type);
      }  
      if (node.log[type] && !collect) { // send old log first
        node.sendLog(type);
        node.log[type]="";
      }  
      if (!node.log[type]) node.log[type]="";
      node.log[type]+=text; // collect log
    }  
    
    // send out log entry defined by type
    this.sendLog = function(type) {
      if (!node.log) return false;
      if (node.log[type]) {
        RED.log[type]("[homie.device.config:"+node.name+"] "+node.log[type]);
        delete node.log[type];
      } else return false;  
      return true;
    }  
    
    // send out all log entries
    this.sendLogs = function() {
      for (var logType in node.log) {
        node.sendLog(logType);
      }  
    }

    this.addValueOrFunction = function (destinationObject,param,value) {
      if (typeof String.prototype.parseFunction != 'function') {
          String.prototype.parseFunction = function () {
              var funcReg = /function *\(([^()]*)\)[ \n\t]*{(.*)}/gmi;
              var match = funcReg.exec(this.replace(/\n/g, ' '));
              if(match) {
                  return new Function(match[1].split(','), match[2]);
              }
              return null;
          };
      }
      var valueFunction;
      if (typeof value === "string" && (valueFunction = value.parseFunction())) {
        destinationObject[param]=valueFunction.bind(this); // to enable this.send() for callback functions.
      }
      else destinationObject[param]= value;
    }

    this.mergeObject = function (destinationObject,sourceObject) {
      for (var element in sourceObject) {
          if (!destinationObject[element]) destinationObject[element]=(Array.isArray(sourceObject[element]))? [] : {};
          if (typeof sourceObject[element] === "object") {
              node.mergeObject(destinationObject[element],sourceObject[element])
          } else {
              node.addValueOrFunction(destinationObject,element,sourceObject[element]);
          }
      }
    }
    
    this.state = 'disconnected';
    this.setState = function (state) {
      node.state = state;
      node.emit('state', state);
    };  
    this.deviceId = config['device-id'];
    this.name = config.name;
    if (this.credentials) {
      this.username = this.credentials.username;
      this.password = this.credentials.password;
    }
    
    this.homieName = config.homieName || "Node-RED"; // device name to be identified by homie devices
    this.homieRoot = config.homieRoot || ""; // root topic for homie devices
    this.baseTopic = ((this.homieRoot)? this.homieRoot : 'homie') + '/' + this.homieName;

    this.options={};
    this.options.usetls = config.usetls || false; // use tls encryption
    this.options.host = config["mqtt-host"];
    this.options.port = (config["mqtt-port"]) ? config["mqtt-port"] : ((this.usetls) ? "1883" : "8883");
    if (this.options.usetls && config.tls) {
      this.tlsNode = RED.nodes.getNode(config.tls);
      if (this.tlsNode) {
        this.tlsNode.addTLSOptions(this.options);
      }    
    }  
    this.options.username= this.username,
    this.options.password= this.password,
    this.options.clientId= this.deviceId + "_" + Math.random().toString(16).substr(2, 8), 
    this.options.will= {
      topic: this.baseTopic + '/$state', 
      payload: 'lost', 
      qos: 2, 
      retain: true
    }  
    this.options.clean = true;
    this.options.usews = config.usews || false; // use web services
    this.options.verifyservercert = config.verifyservercert || false;
    this.brokerurl= (this.options.usetls) ? "mqtts://" : "mqtt://";
    this.brokerurl+= (this.options.host) ? this.options.host : "localhost";
    this.brokerurl+= ":";
    this.brokerurl+= (this.options.port) ? this.options.port : ((this.options.usetls) ? "1883" : "8883");

    this.mqttQOS = config.mqttQOS || 2;
    this.mqttRetain = config.mqttRetain || true;
    this.mqttFirstNonRetainedMsg = false; // flag to indicate first non retained message
    this.homieFriendlyName = config.homieFriendlyName || "Node-RED"; // friendly name to be identified by homie devices
    this.homieDevices = [];
    this.storeGlobal = config.storeGlobal;
    this.fillInDefaults = config.fillInDefaults || true;
    this.useCustomConvention = config.useCustomConvention || false;
    this.homieData = {}; // Image of the homie data on broker(s)
    this.homieProNodes = {}; // Image of homie devices / nodes provided by homie pro (Node-RED)
    this.knownBaseIds = {}; // Store known BaseIds for reconnects
    this.retainedMsgsLoaded = false; // indicates that all retained msgs are processed
    this.timeout = Number(config.timeout) || 0 // timeout in seconds to flush queue (useful if no external device connected)
    this.msgQueue = []; // queue for messages to be sent before all retained msgs are received
    
    node.addToLog("info",`MQTT connect to ${this.brokerurl} as user ${(this.options.username && this.options.username!=='') ? this.options.username : 'anonymous'}`);
    this.client = mqtt.connect(this.brokerurl, this.options);

    this.queueTimeout = function () {
      if (!node.retainedMsgsLoaded) {
        node.addToLog('info',` queue timeout triggered after ${node.timeout} seconds`);
        node.retainedMsgsLoaded = true;
      } else {
        node.addToLog('debug',` queue timeout triggered: queue already released by receiving first non retained message.`);
      }
    }

    this.client.on('connect', function () {
      node.addToLog("info","MQTT connected to "+ node.brokerurl+ " as user "+ (node.options.username) ? (node.options.username) : "anonymous");
      if (node.homieRoot && node.homieRoot!=='') { // subscribe only to config baseId
        node.client.subscribe(node.homieRoot + '/#', { qos: 1 });
        node.setState(`connected (${node.homieRoot}/#)`);
      } else {
        node.client.subscribe('+/+/$homie', { qos: 1 }); // start listening only for new homie roots first
        Object.keys(node.knownBaseIds).forEach (baseId => {
          node.client.subscribe(baseId + '/#', { qos: 1 });
          node.addToLog('info',` re-subscribed to ${baseId}/#`);
        })
        node.setState('connected (auto)');
      }
      // start Timeout to read retained messages from broker
      if (node.timeout>0) {
        node.addToLog('info',` timeout started for ${node.timeout} seconds`);
        setTimeout(node.queueTimeout,node.timeout*1000);
      }
    });

    this.mqttPublish = function (topic, property, options) {
      if (!node.retainedMsgsLoaded) {
        node.msgQueue.push({topic, property, options});
      } else {
        if (node.msgQueue.length>0) {
          node.addToLog('info',` sending ${node.msgQueue.length} queued messages`);
          node.msgQueue.forEach(msg => {
            node.client.publish(msg.topic, msg.property, msg.options);
          })
          node.msgQueue=[];
        }
        node.client.publish(topic, property, options);
      }

    }

    this.sendToDevice = function (homieBase, homieDevice, homieNode, homieProperty, value, setFlag = false, retainFlag = true) {
      var topic = homieBase + '/' + homieDevice + '/' + homieNode + '/' + homieProperty + ((setFlag) ? "/set" : "");
      node.addToLog("debug","sendToDevice "+topic+"="+value,true);
      node.mqttPublish(topic, value.toString(), { qos: 2, retain: retainFlag });
    };

    this.announceClient = function () {
      var memoryUsage=process.memoryUsage();
      node.client.publish(node.baseTopic + '/$state', 'ready', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$homie', '4.0.0', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$name', node.homieFriendlyName, { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$implementation', os.arch(), { qos: 2, retain: true });
      macaddress.one(function (err, mac) {
        node.client.publish(node.baseTopic + '/$mac', mac, { qos: 2, retain: true });
      });
      node.client.publish(node.baseTopic + '/$localip', ip.v4(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$extensions','org.homie.legacy-stats:0.1.1:[4.x],org.homie.legacy-firmware:0.1.1:[4.x]', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$stats/interval', "60", { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$stats/uptime', os.uptime().toString(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$stats/cpuload', Math.floor(os.loadavg()[0]/os.cpus().length*100).toString(), { qos: 2, retain: true }); // 1min average
      node.client.publish(node.baseTopic + '/$stats/freeheap', (memoryUsage.heapTotal-memoryUsage.heapUsed).toString(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$fw/name', 'Node-RED ('+os.platform()+' '+os.release()+') running on '+os.hostname(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$fw/version', RED.version(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$fw/os', os.platform(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$fw/osversion', os.release(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$fw/hostname', os.hostname(), { qos: 2, retain: true });


      setInterval(function(node){ 
        node.client.publish(node.baseTopic + '/$state', 'ready', { qos: 2, retain: true });
        node.client.publish(node.baseTopic + '/$stats/uptime', os.uptime().toString(), { qos: 2, retain: true });
        node.client.publish(node.baseTopic + '/$stats/cpuload', Math.floor(os.loadavg()[0]/os.cpus().length*100).toString(), { qos: 2, retain: true }); // 1min average
        node.client.publish(node.baseTopic + '/$stats/freeheap', (memoryUsage.heapTotal-memoryUsage.heapUsed).toString(), { qos: 2, retain: true });
      }, 60000,node);

      // node.client.subscribe('$SYS/broker/uptime', {qos : 0 });
      // node.client.subscribe('$SYS/broker/version', {qos : 0 });
      // node.client.subscribe('$SYS/broker/retained messages', {qos : 0 });
    };

    // select homie convention definition according to device information
    this.getHomieConvention= function(device) {
      var currentHomieConvention = node.homieConvention[node.latestHomieVersion];
      if (device.hasOwnProperty('$homie')) {
        Object.keys(node.homieConvention).forEach(version => {
          if (version.split(',').includes(device.$homie)) {
            currentHomieConvention = node.homieConvention[version];
            return;
          }
        });
      }
      return currentHomieConvention;
    }

    this.formatProperty = function (payload, $datatype) {
      switch ($datatype) {
        case "float":
          return Number(payload);
        case "integer":
          return Math.floor(Number(payload));
        case "boolean":
          return (payload.toLowerCase()==="true" || payload==='1' || payload.toLowerCase()==='on');
        case "array":
          return payload.split(',');
      }
      return payload;
    }

    this.formatValueToString = function (datatype,format,value) {
      let success = false;
      let resultString;
      switch (datatype.toLowerCase()) {
        case 'integer': // format integer Value
          resultString=Math.floor(Number(value)).toString();
          success = true;
          break;
        case 'float': // format float value
          resultString=Number(value).toFixed(2).toString();
          success = true;
          break;
        case 'datetime': // datetime ISO string
        case 'duration': // duration ISO string
        case 'string': // format string value
        case 'boolean': // format boolean value
          resultString=value.toString();
          success = true;
          break;
        case 'enum': // format enum and get number in enum list
          if (format!==undefined) {
            var enumList = format.split(',');
            if (typeof value === "number" && enumList.length>value) {
              resultString=enumList[value];
              success = true;
            } 
            if (enumList.includes(value)) {
              resultString=value;
              success = true;
            }
          }
          break;
        case 'color': // format color
          switch (format) {
            case 'rgb': // rgb Color
              if (value.hasOwnProperty('r') && value.hasOwnProperty('g') && value.hasOwnProperty('b')) {
                resultString=Math.floor(value.r)+','+Math.floor(value.g)+','+Math.floor(value.b);
                success = true;
              } else if (typeof value === "string" && value.split(',').length===3) {
                resultString=value;
                success = true;
              }
              break;
            case 'hsv': // hsv Color
              if (value.hasOwnProperty('h') && value.hasOwnProperty('s') && value.hasOwnProperty('v')) {
                resultString=Math.floor(value.h)+","+Math.floor(value.s*100)+","+Math.floor(value.v*100);
                success = true;
              } else if (typeof value === "string" && value.split(',').length===3) {
                resultString=value;
                success = true;
              }
              break;
          }
          break;
      }
      if (!success) node.addToLog("error","formatValueToString failed!");
      return resultString;
    }

    this.formatStringToValue = function (datatype,format,property,payload,name) {

      var parseISO8601Duration = function (iso8601Duration) {
        var iso8601DurationRegex = /(-)?P(?:([.,\d]+)Y)?(?:([.,\d]+)M)?(?:([.,\d]+)W)?(?:([.,\d]+)D)?T(?:([.,\d]+)H)?(?:([.,\d]+)M)?(?:([.,\d]+)S)?/;
        var matches = iso8601Duration.match(iso8601DurationRegex);

        var value = {
            sign: matches[1] === undefined ? '+' : '-',
            years: matches[2] === undefined ? 0 : matches[2],
            months: matches[3] === undefined ? 0 : matches[3],
            weeks: matches[4] === undefined ? 0 : matches[4],
            days: matches[5] === undefined ? 0 : matches[5],
            hours: matches[6] === undefined ? 0 : matches[6],
            minutes: matches[7] === undefined ? 0 : matches[7],
            seconds: matches[8] === undefined ? 0 : matches[8]
        };
        value.ms=value.seconds*1000;
        value.ms+=value.minutes*60000;
        value.ms+=value.hours*3600000;
        value.ms+=value.days*86400000;
        value.ms+=value.weeks*604800000;
        if (value.sign==='-') value.ms=value.ms*-1;
      };

      let result = false;
      if (datatype===undefined) datatype=property.$datatype;
      if (format===undefined) format=property.$format;
      if (name===undefined) name=property.$name;
      property.$datatype=datatype;
      property.$format=format;
      property.$name=name;
      
      property.payload=payload;
      switch (datatype) {
        case 'integer': // format integer Value
          property.valueBefore = property.value;
          property.value = Math.floor(Number(payload));
          result = true;
          break;
        case 'float': // format float value
          property.valueBefore = property.value;
          property.value = Number(payload);
          result = true;
          break;
        case 'boolean': // format boolean value
          property.valueBefore = property.value;
          if (payload=='true') {
            property.payload = true;
            property.value = 1;
            result = true;
          } else if (payload=='false') {
            property.payload = false;
            property.value = 0;
            result = true;
          } else {
            property.error = 'true or false expected for boolean datatype';
          }
          break;
        case 'datetime': // format datetime value=timestamp in ms
          property.valueBefore = property.value;
          property.value=Date.parse(payload);
          result = true;
          break;
        case 'duration': // format duration value=duration in ms
          property.valueBefore = property.value;
          property.duration=parseISO8601Duration(payload);
          property.value=property.duration.ms;
          result = true;
          break;
        case 'string': // format string value
          property.valueBefore = property.value;
          property.value=payload;
          result = true;
          break;
        case 'enum': // format enum and get number in enum list
          if (format!==undefined) {
            var enumList = format.split(',');
            if (enumList.includes(payload)) {
                property.valueBefore = property.value;
                property.value = enumList.indexOf(payload);
                property.payload = payload; // keep the payload as payload;
                result = true;
                break;
              } else property.error = payload+' not found in enum $format: '+format;
          } else {
            property.error = '$format expected to provide comma separated list of valid payloads';
          }
          break;
        case 'color': // format color
          switch (format) {
            case undefined: // format not specified
              property.error = '$format expected to provide color space information (RGB or HSV)';
              break;
            case 'rgb': // rgb Color
              var colors = payload.split(',');
              if (colors.length!=3) {
                property.error = 'color value expected as 3 values r,g,b received: '+payload;
                break;
              } else {
                property.valueBefore = property.value;
                property.value = {};
                property.value.r = Number(colors[0]);
                property.value.g = Number(colors[1]);
                property.value.b = Number(colors[2]);
                result = true;
              }
              break;
            case 'hsv': // hsv Color
              var colors = payload.split(',');
              if (colors.length!=3) {
                property.error = 'color value expected as 3 values h,s,v received: '+payload;
              } else {
                property.valueBefore = property.value;
                property.value = {};
                property.value.h = Number(colors[0]);
                property.value.s = Number(colors[1])/100;
                property.value.v = Number(colors[2])/100;
                property.value.a = 1;
                result = true;
              }
              break;
                  
            // error
            default: property.error = '$format invalid. Expected rgb or hsv received: '+format;
          }
          break;
        }
      return result;
    }

    // ----------------------------------------------------------
    // New Message via MQTT
    // ----------------------------------------------------------

    this.pushTo_itemList= function(_itemList,itemValue,itemName) {
      var itemExist=false
      _itemList.forEach(function(item){
        if (item.value==itemValue) {
          itemExist=true;
          return
        }
      });
      if (!itemExist) _itemList.push({"name":itemName,"value":itemValue});
    }

    this.msg2homieIds= function (msg) {
      var splitted = msg.topic.split('/');
      msg.baseId = splitted.shift();
      msg.deviceId = splitted.shift();
      msg.nodeId = splitted.shift();
      msg.propertyId = splitted.shift();
    }

    this.messageArrived = function (topic, message, packet) {
      var currentHomieConvention=node.homieConvention['4.0.0'];
      var payload = message.toString();
      if (payload==="") return; // nothing to do (payload===undefined);
      var errorMsgs = [];
      var success = false;     
      var splitted = topic.split('/');
      var baseId = splitted.shift();
      //if (baseId==='devices') node.addToLog('info',`msg arrived: ${topic}=${payload} ${(packet.retain)? "[retained]":""}`);
      var deviceId = splitted.shift();
      var nodeId = splitted[0];
      var propertyId = splitted[1];
      var msgOut = {
        'topic':topic,
        'payload':payload,
        'baseId':baseId,
        'deviceId':deviceId,
        'mqtt':{
          'messageId' : packet.messageId,
          'qos' : packet.qos,
          'retain' : packet.retain 
        },
        'error': {
          'status':'ok',
          'errorText':''
        },
        'timing': {}
      }

      // wait for first not retained message to do a full validation
      // this is not a solution here because live data will interfere the retained messages replay process (on mosquitto)
      if (packet.retain===false) {
        if (node.mqttFirstNonRetainedMsg===false) {
          node.mqttFirstNonRetainedMsg=true;
          node.retainedMsgsLoaded=true;
          node.addToLog('info',`  First non retained message detected: ${topic}=${payload}`);
          node.announceClient();
        }
      }

      if (!node.homieData.hasOwnProperty(baseId)) {
        if (baseId!=='$sys') {
          node.homieData[baseId]={};
          node.addToLog('info',`  New Homie base topic detected: "${baseId}" subscribed to "${baseId}/#"`);
          node.client.subscribe(baseId + '/#', { qos: 0 });
          if (!node.knownBaseIds.hasOwnProperty(baseId)) {
            node.knownBaseIds[baseId] = {
              firstSeen:Date.now(),
              reconnectCount:0
            }
          } else {
            node.knownBaseIds[baseId].lastReconnect = Date.now();
            node.knownBaseIds[baseId].reconnectCount++;
          }
          return;
        } else {

        }
      }
      if (topic.startsWith('plants/LED-1ch10W-01/DIMMERS/ch1')) {
         // node.addToLog('info',`msg arrived: ${topic}=${message.toString()} ${(packet.retain)? "[retained]":""}`);
      }
      // New homie device detected
      if (!node.homieData[baseId].hasOwnProperty(deviceId)) {
        node.homieData[baseId][deviceId]={};
        // fill in required properties
        if (node.fillInDefaults) {
          Object.keys(currentHomieConvention).forEach(homieKey => {
            if (homieKey.startsWith('$') && currentHomieConvention[homieKey].required===true) {
              node.homieData[baseId][deviceId][homieKey] = (currentHomieConvention[homieKey].hasOwnProperty('default')) ? currentHomieConvention[homieKey].default : "";
            }
          })
        }
        node.addToLog('info',`  New Homie device detected: "${baseId}/${deviceId}"`);
      }

      // ----------------------------------------------------------
      // validate homie node
      // return an array of missing properties
      // ----------------------------------------------------------
      var validateNode = function (node, def) {
        if (node.hasOwnProperty('_validated') && node._validated) return [];
        var missingProperties = [];
        if (!def) {
          return missingProperties;
        }
        Object.keys(def).forEach(defKey => {
          if (defKey.startsWith('$') && !node.hasOwnProperty(defKey)) {
            if (def[defKey].hasOwnProperty('default')) {
              node[defKey] = def[defKey].default;
            } else {
              if (def[defKey].required) {
                missingProperties.push(defKey);
              }
            }
          }
        });
        node._validated = (missingProperties.length===0);
        return missingProperties;
      }
      // ----------------------------------------------------------
      // add message timing and statistics
      // ----------------------------------------------------------
      var addStatics = function (property) {
        if (!property.hasOwnProperty('_timing')) {
          property._timing={};
        }
        
        // create or update event object
        var updateEvent = function (event) {
          let dateNow = Date.now();
          if (!event) event={};
          if (event.receivedTimestamp!==undefined) {
            event.lastTimestamp=event.receivedTimestamp;
          } else {
            event.lastTimestamp=dateNow;
          }
          event.receivedTimestamp=dateNow;
          event.interval=event.receivedTimestamp-event.lastTimestamp;
          
          // Set message Counter
          if (event.counter!==undefined) {
            event.counter++;
          } else {
            event.counter=1;
          }
          return event
        }

        // Statistics for received messages
        property._timing.messages = updateEvent(property._timing.messages)
        // Statistics for updated values
        if (property.hasOwnProperty('_property') && property._property.hasOwnProperty('value') && property._property.hasOwnProperty('valueBefore')) {
          if (property._property.value!==property._property.valueBefore) {
            property._timing.updates = updateEvent(property._timing.updates)
          }
        }
      }

      // ----------------------------------------------------------
      // convert payload to msg object
      // ----------------------------------------------------------
      var convertHomieProperty = function(homieData, payload, msg) {
        if (!homieData.hasOwnProperty("_property")) homieData._property = {};
        var success=node.formatStringToValue(homieData.$datatype,homieData.$format,homieData._property,payload)
        if (!success) {
          homieData._tempPayload = payload; // store payload until property is validated;
          node.addToLog("debug",`   out of order message detected ${msg.topic}=${payload}`);
          homieData._validated = false;
        } else {
          msg.value=homieData._property.value;
          homieData._validated = true;
          homieData.predicted = false;
          homieData.value = homieData._property.value;
          msg.predicted = false;
          addStatics(homieData);
          msg.timing=homieData._timing;
        }
        msg.property=homieData._property;
        msg.value=homieData._property.value;
        return success;
      }

      // ----------------------------------------------------------
      // Analyse homie message: update homie data && msg object
      // this function is called recursively!
      // ----------------------------------------------------------
      var dispatchHomie = function (homieTopic, payload, homieData, msg, def) {
        const property = homieTopic.shift();
        var success = true;
        if (def===undefined) {
          errorMsgs.push(`Unknown definition ${property}=${payload}`);
          return false;
        }
        let defProperty = Object.keys(def).filter(key => key.substr(0,1)==='_')[0];
        // property is mentioned in convention definition
        if (def.hasOwnProperty(property) || def.hasOwnProperty('*')) {
          if (homieTopic.length>0) { // more children present
            // this is a parent property so process the children
            if (!homieData.hasOwnProperty(property) || typeof homieData[property]!=='object') {
              homieData[property]={};
            }
            success = dispatchHomie(homieTopic, payload, homieData[property], msg, def[property] )
          } else {
            // definition of a homie property:
            homieData[property]=node.formatProperty(payload, (def[property]) ? def[property].$datatype : def['*'].$datatype);
            homieData._missingProperties=validateNode(homieData,def);
            msg.typeId="homieAttribute";
            if (!msg.hasOwnProperty('property')) msg.property = {};
            msg.property.$name =  (def[property]) ? def[property].$name : undefined;
            msg.property.$datatype = (def[property]) ? def[property].$datatype : undefined;
            msg.property.$format = (def[property]) ? def[property].$format : undefined;
            msg.property.$settable = (def[property]) ? def[property].$settable : undefined;

            // if property is complete handle out of order payloads
            if (homieData.hasOwnProperty('_missingProperties') && homieData._missingProperties.length===0 &&homieData.hasOwnProperty('_tempPayload')) {
              success = convertHomieProperty (homieData, homieData._tempPayload, msg);
              if (success) { // finally property parameters complete and conversion successful
                msg.payload=homieData._tempPayload;
                msg.topic=msg.topic.slice(0,msg.topic.lastIndexOf('/')); // cut off last property as this is a homie attribute
                node.msg2homieIds(msg);
                delete homieData._tempPayload;
                delete homieData._missingProperties;
                return success;
              } else {
                errorMsgs.push(`conversion of tempPayload failed ${msg.topic}=${payload} $datatype:${homieData.$datatype} $format:${homieData.$format}`);
              }
            }

            // for homie < 4.0.1 default extensions legacy-stats && legacy-firmware
            if (property==='$homie' && (homieData.$homie==='3.0.0' || homieData.$homie==='3.0.1')) {
              homieData.$extensions='org.homie.legacy-stats:0.1.1:[4.x],org.homie.legacy-firmware:0.1.1:[4.x]';
            }
            msg.propertyId=property;
            success = true;
          }

        } else if (property.substr(0,1)!=='$') { // node or property
          if (homieTopic.length>0) { // node
            if (!homieData.hasOwnProperty(property)) {
              homieData[property]={};
              if (node.fillInDefaults && def.hasOwnProperty(defProperty)) {
                Object.keys(def[defProperty]).forEach(homieKey => {
                  if (homieKey.startsWith('$') && def[defProperty][homieKey].required===true) {
                    homieData[property][homieKey] = (def[defProperty][homieKey].hasOwnProperty('default')) ? def[defProperty][homieKey].default : '';
                  } 
                })
              }
            }
            if (homieTopic.length===2 && homieTopic[1]=="set") {
              homieData[property].predicted=true;
              msg.predicted=homieData[property].predicted;
            } else {
              msg.nodeId=property;
            }
            success = dispatchHomie(homieTopic, payload, homieData[property], msg, def[defProperty] )
          } else { // property
            msg.typeId=(property.startsWith('$')) ? "homieProperty" : "homieData";
            if (property==='set') { // property/set detected
              msg.property={};
              success=node.formatStringToValue(homieData.$datatype,homieData.$format,msg.property,payload)
              if (!success) {
                errorMsgs.push(`conversion of paramter/set failed ${property}=${payload} $datatype:${homieData.$datatype} $format:${homieData.$format}`);
              } else {
                homieData[property] = msg.property.value;
                msg.value = msg.property.value;
                msg.setFlag = true;
              }
              homieData.predicted=(homieData.value!=homieData.set);
              msg.predicted = homieData.predicted;
            } 
            else { // property update detected
              msg.propertyId=property;
              if (!homieData.hasOwnProperty(property)) {
                homieData[property]={
                  _property : {},
                  _validated : false
                }
              } 
              homieData[property]._missingProperties=validateNode(homieData[property],def[defProperty]);
              success = convertHomieProperty (homieData[property], payload, msg);
              if (!success ) errorMsgs.push(`conversion of parameter failed ${property}=${payload} $datatype:${homieData[property].$datatype} $format:${homieData[property].$format}`);
            }
          }
        } else {
          errorMsgs.push(`Unknown property ${property}=${payload}`);
          success=false;
        }
        return success;
      }

      // ----------------------------------------------------------
      // Check if msg belongs to an extension: update homie data && msg object
      // this function is called recursively
      // ----------------------------------------------------------
      var dispatchHomieExtensions = function (extensionTopic, payload, homieData, msg, def) {
        if (extensionTopic.length<1) return false;
        const property = extensionTopic.shift().toLowerCase();
        var success = true;
        if (def===undefined) {
          errorMsgs.push(`Unknown extension definition ${extensionTopic}=${payload}`);
          return false;
        }
        if (def.hasOwnProperty(property) || def.hasOwnProperty('*')) {
          if (extensionTopic.length>0) { // node
            if (!homieData.hasOwnProperty(property)) {
              homieData[property]={};
              // fill in required properties.
              Object.keys(def[property]).forEach(defKey => {
                if (def[property][defKey].required) {
                  homieData[property][defKey]={};
                  Object.keys(def[property][defKey]).forEach(defProperty => {
                    if (defProperty.startsWith('$')) {
                      homieData[property][defKey][defProperty]=def[property][defKey][defProperty];
                    }  
                  });
                  if (def[property][defKey].hasOwnProperty('default')) {
                    node.formatStringToValue(undefined,undefined,homieData[property][defKey],def[property][defKey].default.toString());
                  }
                }
              })
            }
            msg.nodeId=property;
            success = dispatchHomieExtensions(extensionTopic, payload, homieData[property], msg, def[property] )
          } else { // property
            let tempProperty = {
              $datatype : (def[property]) ? def[property].$datatype : ((def['*']!==undefined) ? def['*'].$datatype : "string"),
              $format : (def[property]) ? def[property].$format : ((def['*']!==undefined) ? def['*'].$format : ""),
              payload : "",
              value : homieData[property],
              predicted:false,
              validated:true
            }
            success=node.formatStringToValue(undefined,undefined,tempProperty,payload)
            if (success) {
              homieData[property]=tempProperty.value;
              msg.value=tempProperty.value;
              msg.valueBefore=tempProperty.valueBefore;
              msg.typeId="homieExtension";
              msg.propertyId=property;
            }
            msg.payload=payload;
          }
        } else {
          errorMsgs.push(`Unknown extension property ${property}=${payload}`);
          success = false;
        }
        return success;
      }

      var addHomieProperties = function (msg) {
        if (baseId!==undefined) {
          msg.homie = {id : baseId};
        }
        if (deviceId!==undefined) {
          if (!msg.hasOwnProperty("device")) msg.device={};
          msg.device.id = deviceId;
          msg.device.name = node.homieData[baseId][deviceId].$name;
        } else return;
        if (nodeId!==undefined) {
          if (!msg.hasOwnProperty("node")) msg.node={};
          msg.node.id = nodeId;
          msg.node.name = node.homieData[baseId][deviceId][nodeId].$name;
        } else return;
        if (propertyId!==undefined) {
          if (!msg.hasOwnProperty("property")) msg.property={};
          msg.propertyId = propertyId;
          msg.property.id = propertyId;
          msg.property.name = node.homieData[baseId][deviceId][nodeId][propertyId].$name;
        } else return;
      } 

      success = dispatchHomie(Array.from(splitted), payload, node.homieData[baseId][deviceId], msgOut ,node.getHomieConvention(node.homieData[baseId][deviceId]));
      if (success) {
        addHomieProperties(msgOut);
        node.addToLog("trace",`emit message ${msgOut.topic}=${msgOut.payload}`);
        node.emit('message', msgOut);
      } else {
        for (let extension of Object.keys(node.homieExtensions)) {
          success = dispatchHomieExtensions(Array.from(splitted), payload, node.homieData[baseId][deviceId], msgOut, node.homieExtensions[extension]._definition)
          if (success) {
            msgOut.extensionId=extension;
            node.emit('message', msgOut);
            break;
          }
        };
        if (!success) {
          node.addToLog("trace",`${topic}=${payload} have ${errorMsgs.length} errors: ${errorMsgs}!`);
        }
      }
      if (node.storeGlobal) {
        let globalHomieData = node.context().global.get("homieData") || {};
        globalHomieData[node.brokerurl]=node.homieData;
        node.context().global.set("homieData",globalHomieData);
      }
    }

    this.client.on('message', this.messageArrived);

    this.client.on('close', function () {
      node.addToLog("debug","MQTT closed ("+node.brokerurl+")");
      node.setState('close');
    });

    this.client.on('offline', function () {
      node.addToLog("debug","MQTT offline ("+node.brokerurl+")");
      node.setState('offline');
    });

    this.client.on('error', function () {
      node.addToLog("error","MQTT client error ("+node.brokerurl+")");
      node.setState('error');
    });

    this.on('close', function (done) {
      if (node.state === 'connected') {
        node.client.end(true, function () { // need to be force closed??, else done never called..
        done();
      });
      } else {
        done();
      }
    });
  }

  RED.nodes.registerType('homie-convention-broker-config', homieDeviceConfig,
    {
      credentials: {
          username: {type:"text"},
          password: {type:"password"}
      }
    });
};
