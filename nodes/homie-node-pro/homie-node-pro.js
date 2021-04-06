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
  "deviceId": {"$datatype":"string", "required":true},
  "$homie": {"$datatype":"string", "required":true, "default":"4.0.0","icon":"fa fa-label"},
  "$name": {"$datatype":"string", "required":true},
  "$state": {"$datatype":"enum", "required":true, "default":"lost", "$format":"init,ready,disconnected,sleeping,lost,alert"},
  "$extensions": {"$datatype":"string", "required":false, "default":"","icon":"fa fa-labels"},
  "$implementation": {"$datatype":"string", "required":false, "default":"Node-RED","icon":"fa fa-code"},
  "$nodes": {"$datatype":"object", "required":true, "default":"","icon":"fa fa-labels"},
  "_nodes":{
    "nodeId": {"$datatype":"string", "required":true},
    "$name": {"$datatype":"string", "required":true,},
    "$type": {"$datatype":"string", "required":true, "default":""},
    "$properties": {"$datatype":"object", "required":true, "default":""},
    "_properties": {
      "propertyId":{"$datatype":"string", "required":true},
      "$name":{"$datatype":"string", "required":true},
      "$datatype":{"$datatype":"enum", "required":true, "default":"string", "$format":"string,integer,float,boolean,enum,color,datetime,duration"},
      "$format":{"$datatype":"string", "required":false},
      "$settable":{"$datatype":"boolean", "required":false, "default":false},
      "$retained":{"$datatype":"boolean", "required":false, "default":true},
      "$unit":{"$datatype":"string", "required":false, "default":""}
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
        "interval":{"$datatype":"integer","$unit":"sec","required":true,"default":60,"$format":"","description":"Interval in seconds at which the device refreshes its $stats/+","icon":"fa fa-undo"},
        "uptime":{"$datatype":"integer","$unit":"sec","required":true,"default":0,"$format":"","description":"Time elapsed in seconds since the boot of the device","icon":"fa fa-clock-o"},
        "signal":{"$datatype":"integer","$unit":"%","required":false,"default":0,"$format":"0:100","description":"Signal strength","icon":"fa fa-wifi"},
        "cputemp":{"$datatype":"float","$unit":"°C","required":false,"default":0,"$format":"","description":"CPU Temperature","icon":"fa fa-thermometer-half"},
        "cpuload":{"$datatype":"integer","$unit":"%","required":false,"default":0,"$format":"0:100","description":"CPU Load. Average of last $stats/interval including all CPUs","icon":"fa fa-microchip"},
        "battery":{"$datatype":"integer","$unit":"%","required":false,"default":0,"$format":"0:100","description":"Battery level","icon":"fa fa-battery-half"},
        "freeheap":{"$datatype":"integer","$unit":"bytes","required":false,"default":0,"$format":"","description":"Free heap in bytes","icon":"fa fa-braille"},
        "supply":{"$datatype":"float","$unit":"V","required":false,"default":0,"$format":"","description":"Supply Voltage in V","icon":"fa fa-plug"},
      }
    },
  },
  "org.homie.legacy-firmware": {
    "name":"Legacy Firmware",
    "description":"This extension adds the firmware, mac and localip device attributes of Homie 3.0.1 to Homie 4.0.",
    "url":"https://github.com/homieiot/convention/blob/develop/extensions/documents/homie_legacy_firmware_extension.md",
    "version":"0.1.1",
    "homie":"4.x",
    "_definition": {
      "$localip":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","description":"IP of the device on the local network","icon":"fa fa-address-card-o"},
      "$mac":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","description":"Mac address of the device network interface; The format MUST be of the type A1:B2:C3:D4:E5:F6","icon":"fa fa-barcode"},
      "$fw":{
        "name":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","description":"Name of the firmware running on the device; Allowed characters are the same as the device ID","icon":"fa fa-file-code-o"},
        "version":{"$datatype":"string","$unit":"","required":true,"default":"","$format":"","description":"Version of the firmware running on the device","icon":"fa fa-code-fork"},
        "*":{"$datatype":"string","$unit":"","required":false,"default":"","$format":"","description":"Additional parameters","icon":"fa fa-label"} 
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

    this.setClientState = function () {
      var online = 0;
      var offline = 0;
      var bases = 0;
      var devices = 0;
      var ready = 0;
      Object.keys(node.mqttConnections).forEach((path,index) => {
        let client=node.mqttConnections[path];
        if (client.broker.connected) {
          online++
        } else {
          offline++
        }
      })
      var homieProNodes = node.broker.homieProNodes[node.broker.brokerurl];
      for (let baseId in homieProNodes) {
        bases++;
        for (let deviceId in homieProNodes[baseId]) {
          devices++;
          if (homieProNodes[baseId][deviceId].$state==='ready') {
            ready++;
          }
        }
      }
      node.status({fill:(offline>0) ? ((online>0) ? "orange" : "red") : "green",shape:"dot",text:`online:${online}/${online+offline} B:${bases} D:${devices} $ready:${ready}`});
    }

    this.setStatus = function (status, timeout) {
      node.status(status);
      node.addToLog('debug',`STATUS: "${status.text}" (${status.fill.toUpperCase()})`)
      if (node.stateTimer) {
        clearTimeout(node.stateTimer);
        delete node.stateTimer;
      }
      node.stateTimer=setTimeout(()=>{
        node.setClientState();
      },timeout)
    }

    this.log = {};
    this.name = config.name;
    this.broker = RED.nodes.getNode(config.broker);
    this.passMsg=config.passMsg; // pass messages from input to output
    this.autoConfirm=config.autoConfirm; // autoConfirm /set messages
    this.infoError=config.infoError; // include Error messages
    this.infoHomie=config.infoHomie; // include Homie
    this.exposeHomieNodes=config.exposeHomieNodes; // expose homieProNodes in global context;
    this.queueMessages=config.queueMessages; // queue messages during startup;
    this.homieNodeConfig=JSON.parse(config.homieNodeConfig); // homie config via Editor
    this.homieVersion=config.homieVersion || '4.0.0'; // homie Version
    this.homieDefinition=JSON.parse(config.homieDefinition) || homieConvention['4.0.0']; // homie definition via Editor
    this.currentHomieConvention={};
    this.extensionsDefinition=JSON.parse(config.extensionsDefinition) || homieExtensions; // extensions definition via Editor
    this.homieExtensions=config.homieExtensions || {}; // homie extensions
    this.currentExtensions= {}; // Extension Selection
    this.currentExtensionsDefinition = {}; // Extension Definition
    this.mqttConnections={};
    this.msgQueue=[]; // message queue until all retained messages received
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
      switch (def.$datatype) {
        case 'enum':
          if (!def.$format.includes(property)) return false;
          break;
      }
      return true;
    };

    this.isProperty = function (property) {
      return !property.startsWith('$');
    }

    this.mqttPublish = function (topic,property,retained = true){
      node.addToLog("info","send: "+topic+"="+ property+" "+(retained)?'[retained]':'');
      node.broker.mqttPublish(topic, property, { qos: 2, retain: retained });
    }

    this.abortError = function(msg,messageString) {
      node.addToLog("error",messageString);
      if (node.infoError) {
        msg.error={"status":"error"};
        msg.error.errorText=messageString;
      }
      return false;
    }

    // ----------------------------------------------------------------------------
    // update a homie property or extension
    // ---------------------------------------------------------------------------- 

    this.updateHomieProperty = function (msg) {
      var success = true;
      var topicSplitted=msg.topic.split('/');
      var homieProNodes = node.broker.homieProNodes[node.broker.brokerurl];
      var baseId = topicSplitted.shift();
      var homieBase = homieProNodes[baseId];
      var deviceId = topicSplitted.shift();
      var homieDevice = homieBase[deviceId];
      if (homieDevice.hasOwnProperty(topicSplitted)) {
        homieDevice[topicSplitted]=msg.payload;
        node.publishMqttMessage(baseId,deviceId,msg.topic,msg.payload,true);
      } else {
        return abortError(`${topicSplitted} unknown on ${baseId}/${deviceId}!`)
      }
      return success;
    };

    // ----------------------------------------------------------------------------
    // update a homie property
    // ---------------------------------------------------------------------------- 
    this.updateHomieValue = function (msg, baseId, deviceId, nodeId, propertyId, setFlag, value) {
      var success = true;
      var homieProNodes = node.broker.homieProNodes[node.broker.brokerurl];
      if (homieProNodes === undefined) return node.abortError(msg, `No homie definitions found for broker ${node.broker.brokerurl}!`)
      var homieBase = homieProNodes[baseId];
      if (homieBase === undefined) return node.abortError(msg, `No homie devices found for baseId: ${baseId} on broker ${node.broker.brokerurl}!`)
      var homieDevice = homieBase[deviceId];
      if (homieDevice === undefined) return node.abortError(msg, `No homie device ${deviceId} found! baseId: ${baseId} on broker ${node.broker.brokerurl}!`)
      var homieNode = homieDevice.$nodes[nodeId];
      if (homieNode === undefined) {
        if (node.currentHomieConvention.hasOwnProperty(nodeId)) {
          node.mqttPublish(baseId + '/' + deviceId + '/' + nodeId, msg.payload.toString(), node.currentHomieConvention[nodeId].retained);
          msg.property={}
          if (node.broker.formatStringToValue(node.currentHomieConvention[nodeId].$datatype,node.currentHomieConvention[nodeId].$format,msg.property,msg.payload)) {
            homieDevice[nodeId]=msg.payload;
            return success;
          } else {
            return node.abortError(msg, `${baseId}/${deviceId}/${nodeId} ${msg.payload} does not match $datatype:${node.currentHomieConvention[nodeId].$datatype} and $format:${node.currentHomieConvention[nodeId].$format}!`)
          }
        } else {
          return node.abortError(msg, `No homie node ${nodeId} found! deviceId: ${deviceId} baseId: ${baseId} on broker ${node.broker.brokerurl}!`)
        }
      }
      if (homieNode.$properties!==undefined && homieNode.$properties.hasOwnProperty(propertyId)) {
        let homieProperty=homieNode.$properties[propertyId];
        if (value===undefined) { // delete topic
          node.publishMqttMessage(baseId, deviceId, baseId+'/'+deviceId+'/'+ nodeId + '/' + propertyId + ((setFlag) ? '/set' : ''),undefined);
        } else {
          let lastValueString = (homieProperty.value!=null) ? node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,homieProperty.value) : "";
          let newValueString = node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,value);
          if (lastValueString!=newValueString) { // only if new or updated
            node.publishMqttMessage(baseId, deviceId, baseId+'/'+deviceId+'/'+ nodeId + '/' + propertyId + ((setFlag) ? '/set' : ''),newValueString,(homieProperty.hasOwnProperty('$retained')) ? homieProperty.$retained : true);
          }
        }
      }
      return success;
    }

    // ----------------------------------------------------------------------------
    // validate homie definition 
    // ----------------------------------------------------------------------------
    this.validateHomieDef = function(def,homieObject,path) {
      for (var property in def) {
        if (homieObject.hasOwnProperty(property)) {
          if (typeof homieObject[property] === 'object') {
            if (def[property].$datatype === 'object') {
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
            if (def[property].$datatype === 'object') {
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
    
    // ----------------------------------------------------------------------------
    // check topic for invalid chars and simply delete them
    // ----------------------------------------------------------------------------
    this.validateTopic = function(topic) {
      const invalidChars = ['#','+'];
      for (let invalidChar of invalidChars) {
        if (topic.includes(invalidChar)) {
          node.addToLog("warn",`  found invalid character '${invalidChar}' in ${topic}! Please check your configuration.`);
          topic=topic.replace(invalidChar,'');
        }
      }
      return topic;
    }
    
    // ----------------------------------------------------------------------------
    // publish a message to the broker and update homie object
    // ----------------------------------------------------------------------------
    this.publishMessage = function (baseId,deviceId,topic,value,retained) {
      var basePath = baseId+'/'+deviceId;
      if (node.mqttConnections.hasOwnProperty(basePath)) {
        if (node.mqttConnections[basePath].hasOwnProperty('broker')) {
          if (!node.mqttConnections[basePath].broker.connected) {
            node.addToLog("warn",`[publishMqttMessage] client for ${baseId}/${deviceId} disconnected! Will queue the message.`);
          }
          topic= node.validateTopic(topic);
          if (!node.mqttConnections[basePath].broker.disconnecting) {
            node.mqttConnections[basePath].broker.publish(topic,value.toString(),{ qos: 2, retain: retained });
            node.setStatus({fill: 'green', shape: 'dot', text: `${topic} = "${value}"`},5000);
          } else {
            node.setStatus({fill: 'red', shape: 'dot', text: `broker for ${basePath} disconecting`},5000);
          }
        } else {
          node.addToLog("error",`[publishMqttMessage] no broker connection existing for ${baseId}/${deviceId}!`);
        }
      } else {
        node.addToLog("error",`[publishMqttMessage] no broker configuration existing for ${baseId}/${deviceId}!`);
      }
    }

    this.publishMqttMessage = function(baseId,deviceId,topic,value,retained=true) {

      if (node.queueMessages) {
        // queue msgs if broker is still busy reading retained messages
        if (!node.broker.retainedMsgsLoaded) {
          console.log(node.broker.retainedMsgsLoaded);
          node.addToLog("info",`  MQTT message queued (#${node.msgQueue.length}): ${topic} = "${value}" ${(retained) ? '[RETAINED]' : ''}`);
          node.msgQueue.push({baseId,deviceId,topic,value,retained});
          return true;
        }
      } 
      node.addToLog("debug",`  publishMqttMessage: ${topic} = "${value}" retained:${retained}`);
      node.publishMessage(baseId,deviceId,topic,value,retained);
    }
 
    // replay queued messages
    this.flushMsgQueue = function() {
      if (node.msgQueue.length>0) {
        node.addToLog("info",`flush ${node.msgQueue.length} queued messages:`);
        node.msgQueue.forEach((element,index) => {
          node.addToLog("info",`  publish queued MQTT message #${index}: ${element.topic} = "${element.value}" retained:${element.retained}`);
          node.publishMessage(element.baseId,element.deviceId,element.topic,element.value,element.retained)
        })
        node.msgQueue=[];
      }
    }

    // ----------------------------------------------------------------------------
    // init extensions
    // ----------------------------------------------------------------------------
    this.initExtensions = function(baseId,deviceId,def,extensions,config={}) {
      var extensionsArray=[];

      var publishExtensionProperty = function(def,extension,path) {
        var value="";
        Object.keys(def).forEach((property) => {
          if (def[property].hasOwnProperty('$datatype')) {
            if (def[property].required || extension[property].selected) {
              let shortPath = `${path}/${property}`.replace(baseId+'/'+deviceId+'/','');
              value= (config.hasOwnProperty(shortPath)) ? config[shortPath].value : "";
              node.publishMqttMessage(baseId,deviceId,`${path}/${property}`,value,true);
            }
          } else {
            if (extension && extension.hasOwnProperty(property)) {
              publishExtensionProperty(def[property],extension[property].children,`${path}/${property}`);
            }
          }
        });
      };

      Object.keys(extensions).forEach((extension) => {
        if (extensions[extension].selected) {
          node.addToLog("info",`Add Extension ${extension} for ${baseId}/${deviceId}`);
          extensionsArray.push(`${extension}:${def[extension].version}:[${def[extension].homie}]`);
          publishExtensionProperty(def[extension]._definition,extensions[extension].children,baseId+'/'+deviceId);
        }
      });
      node.publishMqttMessage(baseId,deviceId, baseId+'/'+deviceId+'/$extensions',extensionsArray.toString(),true);
    }

    this.brokerMessage = function (topic, message) {
      node.addToLog("info",`MQTT message ${topic}=${message} arrived`);
      try {
        var topicSplitted = topic.split('/');
        var baseId = topicSplitted[0];
        var deviceId = topicSplitted[1];
        var nodeId = topicSplitted[2];
        var propertyId = topicSplitted[3];
        var property = node.broker.homieProNodes[node.broker.brokerurl][baseId][deviceId].$nodes[nodeId].$properties[propertyId];
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

      var stateInterval = function(base, path, configProperty) {
        node.addToLog("debug",`interval for ${path}`);
        var pathSplitted = path.split('/');
        if (base._config[configProperty].hasOwnProperty('increment')) {
          base[configProperty]+=base._config[configProperty].increment;
        }
        node.publishMqttMessage(pathSplitted[0],pathSplitted[1], `${path}/${configProperty}`, base[configProperty].toString(), true);
      };

      var sendToBroker= function (base,path,def){
        for (var property in base) {
          if (base.hasOwnProperty(property)) {
            if (typeof base[property] === 'object'){
              if (property.substr(0,1) === '_') {
                if (property ==='_config') {
                  for (var configProperty in base[property]) {
                    let config = base[property][configProperty];
                    if (config.hasOwnProperty('value')) base[configProperty]=config.value;
                    if (config.hasOwnProperty('interval') && config.heartbeat) {
                      if (config.timer !== undefined) {
                        node.addToLog("info",`  existing timer cleared for ${path}`);
                        clearInterval(config.timer);
                      }
                      if (config.interval<1000) {
                        node.addToLog("warn",`${configProperty} interval=${config.interval}ms! Don't spam your broker! heartbeat set to 1000ms instead!`);
                        config.interval=1000;
                      } else {
                        node.addToLog("info",`${configProperty} heartbeat set to : ${config.interval}ms`);
                      }
                      config.timer=setInterval(function(base, path, configProperty){ 
                        stateInterval(base, path, configProperty); 
                      }, config.interval,base,path,configProperty);
                    }
                  }
                }
              } else if (def) {
                for (var objectId in base[property]) {
                  sendToBroker(base[property][objectId],path+'/'+objectId,def[property.replace("$", "_")]);
                }
                if (def.hasOwnProperty(property) && def[property].$datatype==='object') {
                  node.publishMqttMessage(baseId,deviceId,`${path}/${property}`,Object.keys(base[property]).toString(),true);
                }
              } 
            } else {
              if (base[property]!== undefined){
                node.publishMqttMessage(baseId,deviceId,`${path}/${property}`,base[property].toString(),true);
              } else {
                node.addToLog("error",`publishing to broker ${path}/${property} ${base[property]}`);
              }
            }
          }
        }
      }

      if (node.broker.homieProNodes[node.broker.brokerurl].hasOwnProperty(baseId)) {
        node.addToLog("info",`Step 3: publish homie properties for ${baseId}/${deviceId}`);
        sendToBroker(node.broker.homieProNodes[node.broker.brokerurl][baseId][deviceId], baseId+'/'+deviceId, node.currentHomieConvention);
      }

      if (node.homieExtensions.hasOwnProperty(baseId+'/'+deviceId) || node.homieExtensions.hasOwnProperty('[all]')) {
        var homieDevices = node.broker.homieProNodes[node.broker.brokerurl][baseId];
        node.addToLog("info",`Step 4: publish homie extensions for ${baseId}/${deviceId}`);
        node.currentExtensions = (node.homieExtensions.hasOwnProperty(baseId+'/'+deviceId)) ? node.homieExtensions[baseId+'/'+deviceId] : node.homieExtensions['[all'];
        node.initExtensions(baseId,deviceId,node.currentExtensionsDefinition,node.currentExtensions,homieDevices[deviceId]._config);
      }
    }

    // clear interval timers (for deploy or restart flow)
    this.clearIntervalTimers = function(baseId, deviceId) {
      let device=node.broker.homieProNodes[node.broker.brokerurl][baseId][deviceId];
      if (device.hasOwnProperty('_config')) {
        let config = device._config;
        for (let property in config) {
          if (config[property].hasOwnProperty('timer')) {
            node.addToLog("info",`  timer cleared for ${baseId}/${deviceId}/${property}`);
            clearInterval(config[property].timer);
          }
        }
      }
    }

    this.mqttClientEnded = function (baseId,deviceId) {
      node.addToLog("info",`client connection ended for ${baseId}/${deviceId}`);
      delete node.mqttConnections[baseId+'/'+deviceId];
    }

    // close a broker connection
    this.closeConnection = function (baseId,deviceId) {
      node.addToLog("info",`closing existing broker connections`);
      if (node.mqttConnections.hasOwnProperty(baseId+'/'+deviceId)) {
        // clear any timer in device first
        node.clearIntervalTimers(baseId, deviceId);
        node.addToLog("info",`setting ${deviceId} $state="disconnected"`);
        node.mqttConnections[baseId+'/'+deviceId].broker.publish(baseId+'/'+deviceId+'/$state','disconnected',{ qos: 2, retain: true });
        node.addToLog("info",`closing existing broker connection for ${deviceId}`);
        node.mqttConnections[baseId+'/'+deviceId].broker.end(false,6,function(){
          node.mqttClientEnded(baseId,deviceId);
        });
      }
    }

    this.updateHomieNode = function (msg) {
      var result=false;
      var context = node.context().global;
      if (!node.broker.hasOwnProperty("homieProNodes")) node.broker.homieProNodes = {};
      var homieProNodes = node.broker.homieProNodes;
      if (!homieProNodes.hasOwnProperty(node.broker.brokerurl)) { // first node
        node.addToLog("info","first node @ "+node.broker.brokerurl);
        homieProNodes[node.broker.brokerurl]={};
      }
      var homieNode = homieProNodes[node.broker.brokerurl];

      result = Object.keys(msg).forEach((baseId) => {
        if (!homieNode.hasOwnProperty(baseId)) { // new baseId
          homieNode[baseId]={};
          node.addToLog("info","new base: "+baseId+" ("+Object.keys(homieNode).toString()+")");
        }
        
        if (node.hasOwnProperty('homieDefinition')) {
          node.currentHomieConvention = node.homieDefinition;
          node.addToLog("info","using custom homie convention")
        } else {
          node.currentHomieConvention = homieConvention[node.homieVersion];
        }
        if (node.hasOwnProperty('extensionsDefinition')) {
          node.currentExtensionsDefinition = node.extensionsDefinition;
          node.addToLog("info","using custom homie extensions")
        } else {
          node.currentExtensionsDefinition = homieExtensions;
        }

        let homieDevices=homieNode[baseId];
        let msgDevices=msg[baseId];
        result = Object.keys(msgDevices).forEach((msgDeviceId) => {
          if (!homieDevices.hasOwnProperty(msgDeviceId)) {
            node.addToLog("info","new deviceID: "+msgDeviceId+" ("+Object.keys(homieNode).toString()+")");
            homieDevices[msgDeviceId]={};
          }
          node.addToLog("info",`Step 1: import homie config for ${msgDeviceId}`);
          node.initHomieObject(node.currentHomieConvention,homieDevices[msgDeviceId],msgDevices[msgDeviceId]);
          node.addToLog("info",`Step 2: validate homie config for ${msgDeviceId}`);
          node.validateHomieDef(node.currentHomieConvention,homieDevices[msgDeviceId],baseId+'/'+msgDeviceId);
          node.addToLog("info",`Step 3: establish new MQTT connection for ${msgDeviceId}`);
          // node.closeConnection(baseId,msgDeviceId);
          if (node.mqttConnections.hasOwnProperty(baseId+'/'+msgDeviceId)) {
            node.addToLog("info",`Connection ${baseId}/${msgDeviceId} already exists!`);
            if (!node.mqttConnections[`${baseId}/${msgDeviceId}`].broker.connected) {
              node.addToLog("warn",`Connection ${baseId}/${msgDeviceId} not connected!`);
              node.mqttConnections[`${baseId}/${msgDeviceId}`].broker.reconnect();
            } else {
              node.deviceClientConnected(baseId, msgDeviceId);
            }
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
              node.deviceClientConnected(baseId, msgDeviceId);
            });
            connection.broker.on('end', function () {
              console.log("mqtt end event");
            });
          }   
        });
      });

      if (node.exposeHomieNodes) {
        context.set("homieProNodes",node.broker.homieProNodes);
      } else {
        context.set("homieProNodes",undefined);
      }                           
      return result
    }
    // ------------------------------------------------------------------------------------
    // homie node is configured by the configuration editor on startup
    // ------------------------------------------------------------------------------------
    if (node.queueMessages) {
      node.waitForBroker = setInterval(()=>{
        if (node.broker.retainedMsgsLoaded) {
          if (node.msgQueue.length>0) {
            node.flushMsgQueue();
          }
        }
      },1000);
    }

    if (this.homieNodeConfig && typeof this.homieNodeConfig === 'object') {
      this.errorMessages = [];
      node.addToLog("info",`reading config JSON of homie-pro-node ${this.name}`);
      this.updateHomieNode(node.homieNodeConfig);
      if (this.errorMessages.length>0){
        this.status({fill: 'red', shape: 'dot', text: 'homie configuration has '+ node.errorMessages.length +' errors'});
      } else {
        this.status({fill: 'green', shape: 'dot', text: 'homie configuration updated'});
      }
    }

    this.on('input', function(msg, send, done) {
      node.addToLog("info",`msg from input ${msg.topic}=${msg.payload}`);
      send = send || function() { node.send.apply(node,arguments) }
      var success = true;
      // homie configuration object arrived
      if (msg.hasOwnProperty('homie')) {
        node.addToLog("info",`  including msg.homie`);
        node.errorMessages = [];
        success=node.updateHomieNode(msg.homie);
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
      if (msg.hasOwnProperty('topic') && msg.topic!="" && node.broker.hasOwnProperty("homieProNodes")) {
        var topicSplitted=msg.topic.split('/');
        var homieProNodes = node.broker.homieProNodes[node.broker.brokerurl];
        var setFlag = (topicSplitted[topicSplitted.length-1]==="set");
        if (setFlag) topicSplitted.pop();
        var baseId = topicSplitted[0];
        var homieBase = homieProNodes[baseId];
        var deviceId = topicSplitted[1];
        var homieDevice = homieBase[deviceId];
        var nodeId = topicSplitted[2];
        var propertyId = topicSplitted[3];

        // message to a homie node
        if (homieDevice!==undefined && homieDevice.$nodes!==undefined && homieDevice.$nodes.hasOwnProperty(nodeId)) {
          var homieNode=homieDevice.$nodes[nodeId];
          success = node.updateHomieValue(msg, baseId, deviceId, nodeId, propertyId, setFlag, msg.payload);
          if (success) {
            node.status({fill: 'green', shape: 'dot', text: propertyId+'='+((typeof msg.payload === "object") ? JSON.stringify(msg.payload) : ((msg.payload===undefined) ? "/set deleted" : msg.payload ))});
            if (node.passMsg){
              if (node.infoHomie) {
                msg.$homie=RED.util.cloneMessage(homieNode.$properties[propertyId]);
                msg.$homie.baseId=baseId;
                msg.$homie.deviceId=deviceId;
                msg.$homie.nodeId=nodeId;
                msg.$homie.propertyId=propertyId;
              } 
              send(msg);
            }
          } else {
            node.status({fill: 'yellow', shape: 'dot', text: propertyId+'='+((typeof msg.payload === "object") ? JSON.stringify(msg.payload) : msg.payload )+" failed! $datatype="+homieNode[propertyId].$datatype+" $format="+homieNode[propertyId].$format});
          }
        } else {
          // Message to a homie property or extension
          success = node.updateHomieProperty(msg);
          if (success) {
            node.status({fill: 'green', shape: 'dot', text: `property ${msg.topic}=${msg.payload}`});
            send(msg);
          } else {
            node.status({fill: 'red', shape: 'dot', text: `node:${nodeId} unknown on baseId:${baseId} deviceId:${deviceId}.`});
          }
        }
      }
      if (done) done();
    });
    
    // ----------------------------------------------------------------------------
    // close all mqtt connections and clear existing timers
    // ----------------------------------------------------------------------------
    this.on('close', function (done) {
      var node = this;
      var connections = Object.keys(node.mqttConnections)
      if (connections.length>0) {
        node.addToLog("info",`Disconnecting ${connections.length} broker connections!`);
        for (var device in node.mqttConnections) {
          // clear timers first
          let deviceSplitted = device.split('/');
          let baseId = deviceSplitted[0];
          let deviceId = deviceSplitted[1];
          node.clearIntervalTimers(baseId,deviceId);

          if (node.mqttConnections[device].hasOwnProperty('broker')) {
            node.addToLog("info",`setting ${device} $state="disconnected"`);
            node.mqttConnections[device].broker.publish(device+'/$state','disconnected',{ qos: 2, retain: true });
            node.mqttConnections[device].broker.end(false, function (thisDevice) {
              delete node.mqttConnections[thisDevice];
              node.addToLog("info",`  ${thisDevice} closed! (${Object.keys(node.mqttConnections).length} left)`);
              if (Object.keys(node.mqttConnections).length<1) {
                node.addToLog("info",`  all connections closed!`);
                done();
              }
            }.bind(this, device));
          }
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
            if (!base[item].hasOwnProperty('$datatype')) {
              infoBox = `The ${item} nesting attribute is <b>${(property.required) ? '' : 'not '} required</b>.`
              treeListItem.children=[];
              treeListItem.selected=false;
              treeListItem.info=infoBox;
              children.push(treeListItem)
              addDefBranch(base[item],children[children.length-1].children);
            } else {
              infoBox = `<p>${property.description}</p>`;
              infoBox += (property.required)? `<b>required</b> ` : ``;
              infoBox += `type: <b>${property.$datatype}</b> `;
              infoBox += `unit: <b>${property.$unit}</b> `;
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
