var mqtt = require('mqtt');

var homieConfigExample = { "4.0.0":{
  "homie" : {        
    "demo-1": {
      "_config": 
          {
              "interval":60000,
              "heatbeat":true
          },
      "$name": "Name of the device",
      "$implementation": "Node-RED",
      "$extensions": "org.homie.legacy-stats",
      "$state": "init",
      "$nodes": {
        "node-1": {
            "$name": "a demo node",
            "$type": "Demo Type",
            "$properties": {
                "command": {
                    "$name": "Commands",
                    "$datatype": "enum",
                    "$settable": true,
                    "$retained": true,
                    "$format": "start,stop,pause,next"
                },
                "temperature": {
                    "$name": "current temperature",
                    "$datatype": "float",
                    "$settable": false,
                    "$retained": true,
                    "$format": "-20:40"
                }
              }
            }
          }
        }
      }
    }
  }

var homieConvention = { "4.0.0":{
  "deviceId": {"type":"string", "required":true},
  "$homie": {"type":"string", "required":true, "default":"4.0.0","icon":"fa fa-label"},
  "$name": {"type":"string", "required":true},
  "$state": {"type":"enum", "required":true, "default":"lost", "format":"init,ready,disconnected,sleeping,lost,alert"},
  "$extensions": {"type":"string", "required":false, "default":"","icon":"fa fa-labels"},
  "$implementation": {"type":"string", "required":false, "default":"Node-RED","icon":"fa fa-code"},
  "$nodes": {"type":"object", "required":true, "default":"","icon":"fa fa-labels"},
  "_nodes":{
    "nodeId": {"type":"string", "required":true},
    "$name": {"type":"string", "required":true,},
    "$type": {"type":"string", "required":true, "default":""},
    "$properties": {"type":"object", "required":true, "default":""},
    "_properties": {
      "propertyId":{"type":"string", "required":true},
      "$name":{"type":"string", "required":true},
      "$datatype":{"type":"enum", "required":true, "default":"string", "format":"string,integer,float,boolean,enum,color,datetime,duration"},
      "$format":{"type":"string", "required":false},
      "$settable":{"type":"boolean", "required":false, "default":false},
      "$retained":{"type":"boolean", "required":false, "default":true},
      "$unit":{"type":"string", "required":false, "default":""}
    }        
  }
}};

var homieExtensions = {
  "org.homie.legacy-stats": {
    "name": "Legacy Stats",
    "description":"This extension adds the stats functionality of Homie 3.0.1 to Homie 4.0",
    "url":"https://github.com/homieiot/convention/blob/develop/extensions/documents/homie_legacy_stats_extension.md",
    "version":"0.1.1",
    "homie":"4.x",
    "_definition": {
      "$stats": {
        "interval":{"type":"integer","unit":"sec","required":true,"default":60,"format":"","description":"Interval in seconds at which the device refreshes its $stats/+","icon":"fa fa-undo"},
        "uptime":{"type":"integer","unit":"sec","required":true,"default":0,"format":"","description":"Time elapsed in seconds since the boot of the device","icon":"fa fa-clock-o"},
        "signal":{"type":"integer","unit":"%","required":false,"default":0,"format":"0:100","description":"Signal strength","icon":"fa fa-wifi"},
        "cputemp":{"type":"float","unit":"°C","required":false,"default":0,"format":"","description":"CPU Temperature","icon":"fa fa-thermometer-half"},
        "cpuload":{"type":"integer","unit":"%","required":false,"default":0,"format":"0:100","description":"CPU Load. Average of last $stats/interval including all CPUs","icon":"fa fa-microchip"},
        "battery":{"type":"integer","unit":"%","required":false,"default":0,"format":"0:100","description":"Battery level","icon":"fa fa-battery-half"},
        "freeheap":{"type":"integer","unit":"bytes","required":false,"default":0,"format":"","description":"Free heap in bytes","icon":"fa fa-braille"},
        "supply":{"type":"float","unit":"V","required":false,"default":0,"format":"","description":"Supply Voltage in V","icon":"fa fa-plug"},
      }
    },
  },
  "org.homie.legacy-firmware": {
    "name":"Legacy Firmware",
    "description":"This extension adds the firmware, mac and localip device attributes of Homie 3.0.1 to Homie 4.0.",
    "url":"https://github.com/homieiot/convention/blob/develop/extensions/documents/homie_legacy_firmware_extension.md",
    "version":"0.1.1",
    "_definition": {
      "$localip":{"type":"string","unit":"","required":true,"default":"","format":"","description":"IP of the device on the local network","icon":"fa fa-address-card-o"},
      "$mac":{"type":"string","unit":"","required":true,"default":"","format":"","description":"Mac address of the device network interface; The format MUST be of the type A1:B2:C3:D4:E5:F6","icon":"fa fa-barcode"},
      "$fw":{
        "name":{"type":"string","unit":"","required":true,"default":"","format":"","description":"Name of the firmware running on the device; Allowed characters are the same as the device ID","icon":"fa fa-file-code-o"},
        "version":{"type":"string","unit":"","required":true,"default":"","format":"","description":"Version of the firmware running on the device","icon":"fa fa-code-fork"},
        "*":{"type":"string","unit":"","required":false,"default":"","format":"","description":"Additional parameters","icon":"fa fa-label"} 
      }
    }
  }
};

module.exports = function (RED) {
  function homieNodePro (config) {
    RED.nodes.createNode(this, config);
    let node = this;

    this.handleDeviceState = function (state) {
      var msgOut = {
        "brokerUrl":node.broker.brokerurl,
        "brokerName":node.broker.name,
        "brokerState":state,
        "topic":node.broker.brokerurl+"/homie/"+node.broker.name,
        "payload":state,
        "state":{
          "$name":node.broker.name
        }
      }
      var status={ fill: 'red', shape: 'ring', text: 'MQTT unknown' }
      switch (state) {
        case 'close':
          msgOut.state.$state = "lost";
          status.text = 'MQTT closed';
          status.shape = 'dot';
          break;
        case 'offline':
          msgOut.state.$state = "lost";
          status.text = 'MQTT offline';
          status.shape = 'dot';
          break;
        case 'connected':
          msgOut.state.$state="ready";
          status.shape = 'dot';
          status.fill = 'green';
          status.text = 'MQTT connected';
          break;
        case 'disconnected':
          msgOut.state.$state="lost"
          status.text = 'MQTT disconnected';
          break;
        default:
          status.text = 'MQTT: '+state;
          msgOut.state.$state="alert"
      }
      if (msgOut.$state!==node.lastBrokerState) {
        node.send([msgOut]);
        node.addToLog("info",status.text);
        node.status(status);
        node.lastBrokerState=msgOut.$state;
      }
    };

    this.log = {};
    this.name = config.name;
    this.broker = RED.nodes.getNode(config.broker);
    this.passMsg=config.passMsg; // pass messages from input to output
    this.autoConfirm=config.autoConfirm; // autoConfirm /set messages
    this.infoError=config.infoError; // include Error messages
    this.infoHomie=config.infoHomie; // include Homie
    this.exposeHomieNodes=config.exposeHomieNodes; // expose homieNodes in global context;
    this.homieNodeConfig=JSON.parse(config.homieNodeConfig); // homie config via Editor
    this.homieDefinition=JSON.parse(config.homieDefinition) || homieConvention['4.0.0']; // homie definition via Editor
    this.extensionsDefinition=JSON.parse(config.extensionsDefinition) || homieExtensions; // extensions definition via Editor
    this.homieExtensions=config.homieExtensions || {}; // homie extensions
    this.mqttConnections={};
    this.inputs = 1;
    this.outputs = 1;
    this.lastBrokerState = "";
    this.errorMessages = [];
    this.homieNode = {
        "$name":config.nodeId,
        "$properties":[]
      };

    this.broker.on('state', function (state) {
      node.handleDeviceState(state);
    });

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
        RED.log[type]("[homie.node-pro:"+node.name+"] "+node.log[type]);
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

    this.validateProperty = function (property,def){
      switch (def.type) {
        case 'enum':
          if (!def.format.includes(property)) return false;
          break;
      }
      return true;
    };

    this.isProperty = function (property) {
      return !property.startsWith('$');
    }

    this.mqttPublish = function (topic,property,retained = true){
      node.addToLog("info","send: "+topic+"="+ property+" retained: "+retained);
      node.broker.client.publish(topic, property, { qos: 2, retain: retained });
    }

    this.updateHomieValue = function (homieNode,nodeId,propertyId,setFlag,value) {
      var success = true;
      if (homieNode.hasOwnProperty(propertyId)) {
        let homieProperty=homieNode[propertyId];
        if (value===undefined) { // delete topic
          node.mqttPublish(node.broker.baseTopic + '/' + nodeId + '/' + propertyId + ((setFlag) ? '/set' : ''),undefined);
        } else if (homieProperty.hasOwnProperty("value")) {
          let currentValueString = (homieProperty.value!=null) ? node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,homieProperty.value) : "";
          let newValueString = node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,value);
          if (currentValueString!=newValueString) { // only if new or updated
            if (!(homieProperty.$datatype==="enum" && newValueString==="")) {
              node.mqttPublish(node.broker.baseTopic + '/' + nodeId + '/' + propertyId + ((setFlag) ? '/set' : ''),newValueString,homieProperty.$retained);
              homieProperty.valuePredicted=value;
            } else success = false;
          }
        }
      }
      return success;
    }

    this.updateHomieAttribute = function (nodeId,propertyId,homieNode,property,key,def) {
      if (!homieNode.hasOwnProperty(key) || homieNode[key]!==property) { // Attribute new of differ from previous
        if (node.validateProperty(property,def)) {
          homieNode[key]=property;
          node.mqttPublish(node.broker.baseTopic + '/' + nodeId + ((propertyId!=="") ? '/' + propertyId : '') + '/' + key,property.toString());
        } else {
          node.errorMessages.push({source:"updateHomieAttribute",message:"property misformed ("+key+")",level:"warn"});
        }
      }
      return true;
    }
    
    this.updateHomieProperty = function (nodeId,homieNode,propertyId,properties,def) {
      if (!homieNode.hasOwnProperty(propertyId)) {// init property object
        homieNode[propertyId]={"value":null};
        node.addToLog("info","new property "+propertyId+" ("+Object.keys(homieNode).filter(node.isProperty).toString()+")");
        node.mqttPublish(node.broker.baseTopic+"/"+nodeId+"/$properties",Object.keys(homieNode).filter(node.isProperty).toString());
      }
      var property = properties[propertyId];
      if (typeof property === 'object' && !Array.isArray(property)){
        Object.keys(property).forEach((key) => {
          if (def.hasOwnProperty(key)) {
            node.updateHomieAttribute(nodeId,propertyId,homieNode[propertyId],property[key],key,def[key]);
          } else node.errorMessages.push({source:"updateHomieProperty",message:"unknown key defined ("+key+")",level:"warn"});
        });
      } else {
        node.errorMessages.push({source:"updateHomieProperty",message:"object expected! found "+typeof properties,level:"error"});
        return false;
      }
      return true;
    }

    // ----------------------------------------------------------------------------
    // validate homie definition 
    // ----------------------------------------------------------------------------
    this.validateHomieDef = function(def,homieObject,path) {
      for (var property in def) {
        if (homieObject.hasOwnProperty(property)) {
          if (typeof homieObject[property] === 'object') {
            if (def[property].type === 'object') {
              if (!Array.isArray(def[property])) {
                if (!homieObject.hasOwnProperty(property)) homieObject[property]={}
                for (var objectId in homieObject[property]) {
                  if (!homieObject[property].hasOwnProperty(objectId)) {

                  } else {
                    node.sendLogs();
                    node.validateHomieDef(def[property.replace("$", "_")],homieObject[property][objectId],path+'/'+objectId);
                  }
                }
              } else {
                node.sendLogs();
                node.addToLog("warn",`Property type Array! Expected object! Please check your homie definition in the broker config ${path}/${property}=${typeof def[property]}`);
                continue;
              }
            } else {
              node.sendLogs();
              node.addToLog("warn",`Property type does not match homie convention! def.${path}/${property}=${typeof def[property]} !== ${path}/${property}=${typeof def[property]}`);
              continue;
            }
          } else {
            // node.addToLog("info",`${path}/${property}="${homieObject[property]}" `,true);
          }
        } else { // property not defined!
          // property is required
          if (property.substr(0,1)==='$' && def[property].hasOwnProperty('required') && def[property].required) {
            // required but a default value is defined
            if (def[property].hasOwnProperty('default')) {
              homieObject[property]=def[property].default;
              node.addToLog("info",`Required property missing, using default: ${path}/${property} = ${homieObject[property]}`);
            } else {
              node.sendLogs();
              node.addToLog("error",`Required property not specified! ${path}/${property}! Please check your device definition`);
              continue;
            }
          } else {
            continue;
          }
        }
      }
      node.sendLogs();
    }

    // ----------------------------------------------------------------------------
    // adds homie definition to the homie device tree
    // ----------------------------------------------------------------------------
    this.initHomieObject = function(def,homieObject,msg) {
      for (var property in msg) {
        if (msg.hasOwnProperty(property) && property.substr(0,1) === '_') { // merge any config object
          if (!homieObject.hasOwnProperty(property)) homieObject[property] = {};
          node.broker.mergeObject(homieObject[property],msg[property]);
        } else if (def.hasOwnProperty(property)) {
          if (typeof msg[property] === 'object') {
            if (def[property].type === 'object') {
              if (!Array.isArray(msg[property])) {
                if (!homieObject.hasOwnProperty(property)) homieObject[property]={}
                for (var objectId in msg[property]) {
                  if (!homieObject[property].hasOwnProperty(objectId)) homieObject[property][objectId]={}
                  node.sendLogs();
                  node.initHomieObject(def[property.replace("$", "_")],homieObject[property][objectId],msg[property][objectId]);
                }
              } else {
                node.sendLogs();
                node.addToLog("warn",`Property type Array! Expected object! msg.${property}=${typeof def[property]}`);
              }
            } else {
              node.sendLogs();
              node.addToLog("warn",`Property type does not match homie convention! def.${property}=${typeof def[property]} !== msg.${property}=${typeof def[property]}`);
            }
          } else {
            homieObject[property]=msg[property];
            node.addToLog("info",`${property}="${msg[property]}" `,true);
          }
        } else {
          node.sendLogs();
          node.addToLog("warn",`Property does not match homie convention! ${property}="${msg[property]}"`);
        }
      }
      node.sendLogs();
    }

    this.brokerMessage = function (topic, message) {
      node.addToLog("info",`MQTT message ${topic}=${message} arrived`);
      try {
        var topicSplitted = topic.split('/');
        var baseId = topicSplitted[0];
        var deviceId = topicSplitted[1];
        var nodeId = topicSplitted[2];
        var propertyId = topicSplitted[3];
        var property = node.broker.homieNodes[node.broker.brokerurl][baseId][deviceId].$nodes[nodeId].$properties[propertyId];
        var result = node.broker.formatStringToValue(property.$datatype,property.$format,property,message.toString());
        if (result) {
          if (node.autoConfirm) {
            var topic = baseId+'/'+deviceId+'/'+nodeId+'/'+propertyId;
            node.mqttConnections[baseId+'/'+deviceId].broker.publish(topic,property.payload.toString(),{ qos: 2, retain: property.$retained });
            node.addToLog("info",`MQTT message autoConfirmed ${topic}=${property.payload.toString()}`);
          }
        } else {
          node.addToLog("error",`an error occurred: ${property.error}`);
        }
      } catch(err) {
        node.addToLog("error",`an error occurred: ${err.name}`);
      }
    };

    // ----------------------------------------------------------------------------
    // virtual device connected to the broker: send initialization
    // ----------------------------------------------------------------------------

    this.deviceClientConnected = function (baseId,deviceId) {
      node.addToLog("info",`MQTT connected to ${node.broker.brokerurl}/${baseId}/${deviceId}`);
      node.mqttConnections[baseId+'/'+deviceId].broker.subscribe(`${baseId}/${deviceId}/+/+/set`, { qos: 2 });
      node.addToLog("info",`subscribed to ${baseId}/${deviceId}/+/+/set QoS=2`);
      node.mqttConnections[baseId+'/'+deviceId].broker.on('message', this.brokerMessage);

      var mqttPublish= function (topic,value,retained = true) {
        //console.log(node.broker.homieNodes[node.broker.brokerurl][baseId][deviceId]);
        node.mqttConnections[baseId+'/'+deviceId].broker.publish(topic,value,{ qos: 2, retain: retained });
        node.addToLog("info",`send to broker: ${topic} = ${value}`);
      }

      var stateInterval = function(base,path) {
        // console.log(`$state to broker: ${path}/$state = ${base.$state}`);
        var pathSplitted = path.split('/');
        node.mqttConnections[pathSplitted[0]+'/'+pathSplitted[1]].broker.publish(`${path}/$state`,base.$state);
      };

      var sendToBroker= function (base,path,def){
        for (var property in base) {
          if (base.hasOwnProperty(property)) {
            if (typeof base[property] === 'object'){
              if (property.substr(0,1) === '_') {
                if (property ==='_config') {
                  if (base[property].hasOwnProperty('interval') && base[property].heatbeat) {
                    node.addToLog("info",`$state heartbeat set to : ${base[property].interval}ms`);
                    base[property].timer=setInterval(function(base,path){ stateInterval(base, path); }, base[property].interval,base,path);
                  }
                }
              } else if (def) {
                for (var objectId in base[property]) {
                  sendToBroker(base[property][objectId],path+'/'+objectId,def[property.replace("$", "_")]);
                }
                if (def.hasOwnProperty(property) && def[property].type==='object') {
                  mqttPublish(`${path}/${property}`,Object.keys(base[property]).toString());
                }
              } 
            } else {
              if (base[property]!== undefined){
                mqttPublish(`${path}/${property}`,base[property].toString());
              } else {
                node.addToLog("error",`publishing to broker ${path}/${property} ${base[property]}`);
              }
            }
          }
        }
      }

      if (node.broker.homieNodes[node.broker.brokerurl].hasOwnProperty(baseId)) {
        sendToBroker(node.broker.homieNodes[node.broker.brokerurl][baseId][deviceId], baseId+'/'+deviceId,node.broker.homieConvention);
      }
    }

    this.brokerDisconnected = function (baseId,deviceId) {
      node.addToLog("info",`closed connection for ${baseId}/${deviceId}`);
      delete node.mqttConnections[baseId+'/'+deviceId];
    }

    // close a broker connection
    this.closeConnection = function (baseId,deviceId) {
      if (node.mqttConnections.hasOwnProperty(baseId+'/'+deviceId)) {
        // clear any timer in device first
        for (let property in node.broker.homieNodes[node.broker.brokerurl][baseId][deviceId]) {
          if (node.broker.homieNodes[node.broker.brokerurl][baseId][deviceId][property].hasOwnProperty('timer')) {
            node.addToLog("info",`clear timer for ${baseId}/${deviceId}/${property}`);
            clearInterval(node.broker.homieNodes[node.broker.brokerurl][baseId][deviceId][property].timer);
          }
        }
        node.addToLog("info",`closing existing broker connection for ${deviceId}`);
        node.mqttConnections[baseId+'/'+deviceId].broker.end(true,6,function(){
          node.brokerDisconnected(baseId,deviceId);
        });
      }
    }

    this.updateHomieNode = function (msg) {
      var result=false;
      var context = node.context().global;
      if (!node.broker.hasOwnProperty("homieNodes")) node.broker.homieNodes = {};
      var homieNodes = node.broker.homieNodes;
      if (!homieNodes.hasOwnProperty(node.broker.brokerurl)) { // first node
        node.addToLog("info","first node @ "+node.broker.brokerurl);
        homieNodes[node.broker.brokerurl]={};
      }
      var homieNode = homieNodes[node.broker.brokerurl];

      result = Object.keys(msg).forEach((baseId) => {
        if (!homieNode.hasOwnProperty(baseId)) { // new baseId
          homieNode[baseId]={};
          node.addToLog("info","new base: "+baseId+" ("+Object.keys(homieNode).toString()+")");
        }
        let homieDevices=homieNode[baseId];
        let msgDevices=msg[baseId];
        result = Object.keys(msgDevices).forEach((msgDeviceId) => {
          if (!homieDevices.hasOwnProperty(msgDeviceId)) {
            node.addToLog("info","new deviceID: "+msgDeviceId+" ("+Object.keys(homieNode).toString()+")");
            homieDevices[msgDeviceId]={};
          }
          node.addToLog("info",`Step 1: import homie config for ${msgDeviceId}`);
          node.initHomieObject(node.broker.homieConvention,homieDevices[msgDeviceId],msgDevices[msgDeviceId]);
          node.addToLog("info",`Step 2: validate homie config for ${msgDeviceId}`);
          node.validateHomieDef(node.broker.homieConvention,homieDevices[msgDeviceId],baseId+'/'+msgDeviceId);
          node.addToLog("info",`Step 3: establish new MQTT connection for ${msgDeviceId}`);
          node.closeConnection(baseId+'/'+msgDeviceId);
          if (node.mqttConnections.hasOwnProperty(baseId+'/'+msgDeviceId)) {
            node.addToLog("warn",`Connection ${baseId}/${msgDeviceId} already exists!`);
          } else {
            node.mqttConnections[baseId+'/'+msgDeviceId]={};
            let connection = node.mqttConnections[baseId+'/'+msgDeviceId];
            connection.options = RED.util.cloneMessage(node.broker.options);
            connection.options.clientId= RED.util.generateId();
            connection.options.will= {
              topic: baseId + '/' + msgDeviceId + '/$state', 
              payload: 'lost', 
              qos: 2, 
              retain: true
            }
            connection.broker= mqtt.connect(node.broker.brokerurl, connection.options);
            connection.broker.on('connect', function () {
              node.deviceClientConnected(baseId,msgDeviceId);
            });
          }   
        });
      });

      if (node.exposeHomieNodes) {
        context.set("homieNodes",node.broker.homieNodes);
      } else {
        context.set("homieNodes",undefined);
      }                           
      return result
    }

    // homie node is configured by the configuration editor on startup
    console.log(node.homieExtensions);

    if (this.homieNodeConfig && typeof this.homieNodeConfig === 'object') {
      node.addToLog("info",`reading config JSON of homie-node ${this.name}`);
      this.updateHomieNode(node.homieNodeConfig);
      if (this.errorMessages.length>0){
        this.status({fill: 'red', shape: 'dot', text: 'homie configuration has '+ node.errorMessages.length +' errors'});
      } else {
        this.status({fill: 'green', shape: 'dot', text: 'homie configuration updated'});
      }
    }

    this.on('input', function(msg, send, done) {
      send = send || function() { node.send.apply(node,arguments) }
      var success = true;
      // homie configuration object arrived
      if (msg.hasOwnProperty('homie')) { 
        success=node.updateHomieNode(msg);
        if (node.errorMessages.length>0) node.status({fill: 'red', shape: 'dot', text: 'msg.homie has '+ node.errorMessages.length +' errors'});
        else node.status({fill: 'green', shape: 'dot', text: 'msg.homie imported'});
      }
      if (!success && node.infoError && node.errorMessages.length>0) { // add error list to message
        msg.error=RED.util.cloneMessage(node.errorMessages);
        send([msg]); // only send msg on error
        if (done) done();
        return; // better stop here until errors are fixed!
      }

      // update Node-RED device on broker
      if (msg.hasOwnProperty('topic') && msg.topic!="" && node.broker.hasOwnProperty("homieNodes")) {
        var topicSplitted=msg.topic.split('/');
        var homieNodes = node.broker.homieNodes[node.broker.brokerurl];
        var setFlag = (topicSplitted[topicSplitted.length-1]==="set");
        if (setFlag) topicSplitted.pop();
        var deviceId = (topicSplitted.length>2) ? topicSplitted[topicSplitted.length-3] : node.broker.homieName;
        if (deviceId == node.broker.homieName) {
          var nodeId = (topicSplitted.length>1) ? topicSplitted[topicSplitted.length-2] : node.nodeId;
          var propertyId = topicSplitted[topicSplitted.length-1];
          if (homieNodes!==undefined && homieNodes.hasOwnProperty(nodeId)) {
            var homieNode=homieNodes[nodeId];
            success = node.updateHomieValue(homieNode,nodeId,propertyId,setFlag,msg.payload);
            if (success) {
              node.status({fill: 'green', shape: 'dot', text: propertyId+'='+((typeof msg.payload === "object") ? JSON.stringify(msg.payload) : ((msg.payload===undefined) ? "/set deleted" : msg.payload ))});
              if (node.passMsg){
                if (node.infoHomie) msg.homie=homieNode[propertyId];
                send(msg);
              }
            } else {
              node.status({fill: 'yellow', shape: 'dot', text: propertyId+'='+((typeof msg.payload === "object") ? JSON.stringify(msg.payload) : msg.payload )+" failed! $datatype="+homieNode[propertyId].$datatype+" $format="+homieNode[propertyId].$format});
            }
          }
        }
      }
      if (done) done();
    });
    
    // handle message for mqtt broker to Node-REd (as device)
    this.broker.on('redHomieMessage', function (msg, send, done) {
      send = send || function() { node.send.apply(node,arguments) }
      if (msg.payload==="") { // msg.hasOwnProperty("property") || 
        if (done) done();
        return;
      }
      if (!node || node===null || !node.hasOwnProperty("id")){
        if (done) done();
        return;
      }
      thisNode = RED.nodes.getNode(node.id);
      if (node && node.broker && node.broker.hasOwnProperty("homieNodes")) {
        var originalPayload = msg.payload;
        var topicSplitted=msg.topic.split('/');
        if (topicSplitted.length>3 && (node.nodeId=='[any]' || topicSplitted[2]==node.nodeId)) {
          var homieNodes = node.broker.homieNodes[node.broker.brokerurl];
          var propertyId = topicSplitted[3];
          var nodeId = topicSplitted[2];
          if (homieNodes!==undefined && homieNodes.hasOwnProperty(nodeId) && homieNodes[nodeId].hasOwnProperty(propertyId)) {
            // send({payload:"Broker message","msg":msg});
            // console.log({payload:"Broker message","msg":msg})
            var homieProperty = homieNodes[nodeId][propertyId];
            // this node ONLY accepts messages on the /set topic! $settable must be true!
            if (topicSplitted[4]=='set' && homieProperty.$settable) {
              msg.property = {value:homieProperty.value};
              result = node.broker.formatStringToValue(homieProperty.$datatype,homieProperty.$format,msg.property,msg.payload);
              if (!homieProperty.$datatype=='enum') {
                msg.payload=msg.property.value;
              } else { // for $datatype=='enum' keep the payload
                msg.value=msg.property.value;
              }
              if (node.autoConfirm && topicSplitted[4]=='set') node.updateHomieValue(homieNodes[nodeId],nodeId,propertyId,false,originalPayload);
              homieProperty.value=msg.property.value;
              if (node.infoHomie) msg.homie=RED.util.cloneMessage(homieProperty);
              if (node.passMsg || topicSplitted[4]=='set') send(msg);
              node.status({fill: 'green', shape: 'dot', text: propertyId+'/set ='+originalPayload});
            } else { // reset property to stored value

              var updateProperty = function() {
                msg.property = {value:homieProperty.value};
                node.broker.formatStringToValue(homieProperty.$datatype,homieProperty.$format,msg.property,originalPayload);
                homieProperty.value=msg.property.value;
                if (homieProperty.$datatype!=="enum") {
                  msg.payload=msg.property.value;
                } else if (homieProperty.hasOwnProperty("$format")) {
                  let options = homieProperty.$format.split(',');
                  msg.payload = options[msg.property.value];
                  msg.option = msg.property.value;
                }
                if (node.passMsg) send(msg);
                delete homieProperty.valuePredicted;
              }

              if (topicSplitted[4]=='set' && !homieProperty.$settable) {
                node.addToLog("warn","/set message not accepted because property $settable=false!");
                node.mqttPublish(node.broker.baseTopic + '/' + nodeId + '/' + propertyId + '/set',undefined);
                node.status({fill: 'yellow', shape: 'dot', text: propertyId+'/set but NOT $settable'});
              } else {
                // reject all property changes form outside except the first time
                if (homieProperty && homieProperty.hasOwnProperty("value") && homieProperty.value!==null) {
                  if (homieProperty.hasOwnProperty("valuePredicted") && 
                      node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,homieProperty.valuePredicted)!=originalPayload) {
                    node.status({fill: 'yellow', shape: 'dot', text: propertyId+' changed externally! rejected'});
                    node.addToLog("warn",nodeId+'/'+propertyId+'='+originalPayload+" update form outside detected. Original value restored! ("+homieProperty.value.toString()+")");
                    node.mqttPublish(node.broker.baseTopic + '/' + nodeId + '/' + propertyId,
                      node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,homieProperty.value));                  
                  } else {
                    updateProperty();
                  }
                } else {
                  updateProperty();
                }
              }
            }
          }
          if (done) done();
        } else {
          // node.status({fill: 'red', shape: 'dot', text: 'node not defined correctly'});
          // node.addToLog("error","node not defined correctly homieNodes="+node.broker.hasOwnProperty(homieNodes));
        }
      }
      // if (done) done();
    });

    this.on('close', function (done) {
      var node = this;
      var connections = Object.keys(node.mqttConnections)
      if (connections.length>0) {
        node.addToLog("info",`Disconnecting ${connections.length} broker connections!`);
        for (var device in node.mqttConnections) {
          node.mqttConnections[device].client.end(false, function () { // need to be force closed, else done never called..
            console.log("mqtt disconnected",node)
            node.addToLog("info",`${device} closed!`);
            delete node.mqttConnections[device];
            if (Object.keys(node.mqttConnections).length==0) {
              node.addToLog("info",`all connections closed!`);
              done();
            }
          });
        }
      } else {
        done();
      }
    });
  }

  RED.nodes.registerType('homie-convention-node-pro', homieNodePro);
  
  RED.httpAdmin.get("/homieConvention/proDeviceList", RED.auth.needsPermission('homie-convention-device.read'), function(req,res) {
    var config = req.query;
    var node = RED.nodes.getNode(config.node);
    var devices = [];
    switch(config.itemID) {
      case 'exDeviceId':
        if (node && node.hasOwnProperty('mqttConnections')) {
          devices = Object.keys(node.mqttConnections);
        }
        break;
      case 'homieNodeConfig':
        devices = homieConfigExample[config.version];
        break;
      case 'homieDefinition':
        devices = homieConvention[config.version];
        break;
      case 'extensionsDefinition':
        devices = homieExtensions;
        break;
      case 'extensions':
        var addDefBranch = function (base,children) {
          Object.keys(base).forEach((item) => {
            let property = base[item];
            let treeListItem = {label:`${item}`,expanded:true}
            let infoBox = '';
            if (!base[item].hasOwnProperty('type')) {
              infoBox = `The ${item} nesting attribute is <b>${(property.required) ? '' : 'not '} required</b>.`
              treeListItem.children=[];
              treeListItem.selected=false;
              treeListItem.info=infoBox;
              children.push(treeListItem)
              addDefBranch(base[item],children[children.length-1].children);
            } else {
              infoBox = `<p>${property.description}</p>`;
              infoBox += (property.required)? `<b>required</b> ` : ``;
              infoBox += `type: <b>${property.type}</b> `;
              infoBox += `unit: <b>${property.unit}</b> `;
              treeListItem.info=infoBox;
              if (!property.required) {
                treeListItem.selected=false;
              }
              if (property.hasOwnProperty("icon")) {
                treeListItem.icon=property.icon;
              }
              children.push(treeListItem)
            }
          });
        };
        Object.keys(homieExtensions).forEach((item) => {
          let extension = homieExtensions[item];
          let infoBox =`<p>${extension.description}</p>`;
          infoBox += `<p><a href="${extension.url}" target="_blank">detailed info on github</a> Version: <b>${extension.version}</b> Homie: <b>${extension.homie}</b></p>`;
          devices.push({label:item, info:infoBox, children:[], selected:false, expanded:true});
          addDefBranch(homieExtensions[item]._definition,devices[devices.length-1].children);
        });
        break;
    }
    console.log(devices);
    res.json(devices)
  });

};
