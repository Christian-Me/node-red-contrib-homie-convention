var ip = require('internal-ip');
var mqtt = require('mqtt');

module.exports = function (RED) {
  function homieDeviceConfig (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.state = 'disconnected';
    this.setState = function (state) {
      node.state = state;
      node.emit('state', state);
    };

    this.mqttHost = config['mqtt-host'];
    this.mqttPort = config['mqtt-port'];
    this.mqttQOS = config.mqttQOS || 2;
    this.mqttRetain = config.mqttRetain || true;
    this.deviceId = config['device-id'];
    this.name = config.name;
    this.homieName = config.homieName || "Node-RED"; // name to be identified by homie devices
    this.homieRoot = config.homieRoot || "homie"; // root topic for homie devices
    this.homieDevices = [];
    this.baseTopic = this.homieRoot + '/' + this.homieName;
    this.storeGlobal = config.storeGlobal;

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
        RED.log[type]("contrib-homie-convention homie.device.config: "+node.log[type]);
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

    this.client = mqtt.connect({ host: this.mqttHost, port: this.mqttPort, clientId: this.deviceId, will: {
      topic: this.baseTopic + '/$state', payload: 'away', qos: 2, retain: true
    }});

    this.sendProperty = function (nodeId, name, value) {
      node.client.publish(node.baseTopic + '/' + nodeId + '/' + name, value, { qos: 2, retain: true });
    };

    this.sendToDevice = function (homieDevice, homieNode, homieProperty, value) {
      var topic = node.homieRoot + '/' + homieDevice + '/' + homieNode + '/' + homieProperty +'/set';
      node.addToLog("debug","sendToDevice "+topic+"="+value,true);
      node.client.publish(topic, value.toString(), { qos: 2, retain: true });
    };

    this.client.on('connect', function () {
      node.addToLog("debug","MQTT connect");

      node.setState('connected');

      node.client.publish(node.baseTopic + '/$state', 'ready', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$name', node.name, { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$localip', ip.v4(), { qos: 2, retain: true });

      node.client.subscribe(node.homieRoot + '/#', { qos: 2 });
    });

    // initialize an store everything within a homie/# message
    this.addHomieValue = function(topic,message) {
      var splitted = topic.split('/');
      var deviceId = splitted[1];
      var nodeId = splitted[2] || '';
      var propertyId = splitted[3] || '';
      var property = splitted[4] || '';
      
      if (node.storeGlobal) {
        var context = node.context().global || {}; // store copy in global context
        var globalStore = context.get("homieStore") || {};
        if (!globalStore[node.name]) globalStore[node.name]={};
        var globalDevices=globalStore[node.name];
      }
 
      if (node.homieData===undefined) node.homieData={};
      
      // initialized root object for a new device
      if (node.homieData[deviceId]===undefined) {
        node.addToLog("info","Homie: new Device found :"+ deviceId);
        node.homieData[deviceId]={"deviceId":deviceId, $extensions:"", validated: false, validationError: "new Device, waiting for additional data"};
      }
      if (globalDevices && !globalDevices[deviceId]) {
        globalDevices[deviceId]={"deviceId": deviceId};
      }
      if (node.homieDevices===undefined) node.homieDevices=[];
      // add new Devices to homieDevices array
      if (!node.itemExists(node.homieDevices,'name',deviceId)) node.homieDevices.push({"name":deviceId});

      var homieDevice=node.homieData[deviceId];

      if (nodeId.substr(0,1)=='$') {
        homieDevice[nodeId]=message.toString();
        if (globalDevices) globalDevices[deviceId][nodeId]=message.toString();
        node.addToLog("debug",deviceId+" "+nodeId+"="+message.toString());
      } else {
        if (!homieDevice[nodeId]) { // initialize Node
          homieDevice[nodeId]={"nodeId":nodeId, validated: false, validationError: "new Node, waiting for additional data"};
          if (globalDevices && !globalDevices[deviceId][nodeId]) globalDevices[deviceId][nodeId]={"nodeId": nodeId};
        }
        var homieNode=homieDevice[nodeId];
        if (propertyId.substr(0,1)=='$') {
          homieNode[propertyId]=message.toString();
          if (globalDevices) globalDevices[deviceId][nodeId][propertyId]=message.toString();
          node.addToLog("debug",deviceId+"/"+nodeId+" "+propertyId+"="+message.toString());
        } else {
          if (!homieNode[propertyId]) { // initialize property
            homieNode[propertyId]={"propertyId":propertyId, $format:"", $settable:false, $retained:true, $unit:"", validated: false, validatedFormat: false, validatedUnit: false, validationError: "new Node, waiting for additional data"};
            if (globalDevices && !globalDevices[deviceId][nodeId][propertyId]) globalDevices[deviceId][nodeId][propertyId]={"propertyId": propertyId};
          }
          var homieProperty=homieNode[propertyId];
          if (property.substr(0,1)=='$') {
            homieProperty[property]=message.toString();
            if (globalDevices) globalDevices[deviceId][nodeId][propertyId][property]=message.toString();
            node.addToLog("debug",deviceId+"/"+nodeId+"/"+propertyId+" "+property+"="+message.toString());
          } else {
            homieProperty.message=message.toString();
            if (globalDevices) globalDevices[deviceId][nodeId][propertyId].message=message.toString();
          }
        }
      }
      if (globalDevices) context.set("homieStore",globalStore);
      return true;
    }

    //check if a item is included in nodeArray
    this.itemExists = function(nodeArray,key,value) {
      for (var i=0; i<nodeArray.length; i++) {
        if (nodeArray[i][key]===value)
          return true;
      }
      return false;
    }
    
    this.validateHomie = function(homieType, deviceName, nodeName, propertyName) { // validate homie device / node or property
      
      var validateProperty = function(currentProperty) {
        if (!currentProperty) return false;
        // if (currentProperty.validated) return true; // already validated
        currentProperty.validated=false;
        if (currentProperty.$name===undefined)  {currentProperty.validationError="$name not specified"; return false;}
        if (currentProperty.$datatype===undefined) {currentProperty.validationError="$datatype not specified"; return false;}
        if (!(currentProperty.$datatype=="integer" ||
              currentProperty.$datatype=="float" ||
              currentProperty.$datatype=="string" ||
              currentProperty.$datatype=="boolean" ||
              currentProperty.$datatype=="enum" ||
              currentProperty.$datatype=="color")) {currentProperty.validationError="$datatype defined but not any of integer, float, boolean,string, enum, color"; return false;}
        // check of enum $datatype has a comma separated list of minimum 2 items
        if (currentProperty.$datatype==='enum') {
          if (currentProperty.$format===undefined || currentProperty.$format.length==0) {currentProperty.validationError="enum $datatype need $format specified"; return false;}
          if (currentProperty.$format.indexOf(',')<0) {currentProperty.validationError="enum $datatype expects $format with minimum of 2 comma separated values"; return false;}
        }
        // check if color $datatype is formated correctly
        if (currentProperty.$datatype==='color') {
          if (currentProperty.$format===undefined || currentProperty.$format.length==0) {currentProperty.validationError="color $datatype need $format specified"; return false;}
          if (currentProperty.$format!=='rgb' && currentProperty.$format!=='hsv') {currentProperty.validationError="color $datatype expects $format with 'rgb' or 'hsv' value"; return false;}
        }
        // check for optional $unit parameter
        if (currentProperty.$unit!="") currentProperty.validatedUnit= true;
        // check for optional $format parameter
        if (currentProperty.$format!="") currentProperty.validatedFormat= true;

        node.addToLog("info","Validation of PROPERTY: "+deviceName+"/"+nodeName+"/"+propertyName+" success! ("+propertyName+")");
        currentProperty.validationError = "";
        currentProperty.validated = true;
        return true;
      }

      var validateNode = function (currentNode) {
        currentNode.validationError="";
        if (currentNode.validated) return true; // already validated
        if (currentNode.$name===undefined) currentNode.validationError+="$name ";
        if (currentNode.$type===undefined) currentNode.validationError+="$type ";
        if (currentNode.$properties===undefined) currentNode.validationError+="$properties ";
        if (currentNode.validationError.length>0) {currentNode.validationError+="not specified"; return false;}
  
        node.addToLog("info","Validation of NODE: "+deviceName+"/"+nodeName+" sucsess!");
        currentNode.validationError = "";
        currentNode.validated = true;
        return true;
      }

      var validateDevice = function(currentDevice) {
        if (currentDevice===undefined) {currentDevice.validationError="device not unknown"; return false;}
        if (currentDevice.validated) return true; // already validated
        currentDevice.validationError="";
        if (currentDevice.$homie===undefined) currentDevice.validationError+="$homie ";
        if (currentDevice.$name===undefined) currentDevice.validationError+="$name ";
        if (currentDevice.$state===undefined) currentDevice.validationError+="$state ";
        if (currentDevice.$nodes===undefined) currentDevice.validationError+="$nodes ";
        if (currentDevice.validationError.length>0) {currentDevice.validationError+="not specified"; return false;}

        if ((currentDevice.itemList===undefined)) {currentDevice.validationError="internal list of nodes not defined"; return false;}
        
        node.addToLog("info","Validation of DEVICE: "+deviceName+" sucess!");
        currentDevice.validated = "";
        currentDevice.validated = true;
        return true;
      }
      
      var result = false;
      switch(homieType) {
        case 'device' :
          result= validateDevice(node.homieData[deviceName]);
          node.sendLogs();
          if (result) {
            node.emit('validatedDevice', deviceName, '', '', '');
          } else {
            node.addToLog("trace","Validation of Device:"+deviceName+" failed! ("+node.homieData[deviceName].validationError+")");
           }
          return result;
        case 'node' :    
          result= validateNode(node.homieData[deviceName][nodeName]);
          if (result) node.emit('validatedNode', deviceName, nodeName , '', '');
          else {
            node.addToLog("trace","Validation of Node: "+deviceName+"/"+nodeName+" failed! ("+node.homieData[deviceName][nodeName].validationError+")");
           }
          return result;
        case 'property': 
          result= validateProperty(node.homieData[deviceName][nodeName][propertyName]);
          if (result) node.emit('validatedProperty', deviceName, nodeName, propertyName, '');
          else {
            node.addToLog("trace","Validation of Property:"+deviceName+"/"+nodeName+"/"+propertyName+" failed! ("+node.homieData[deviceName][nodeName][propertyName].validationError+")");
           }
          return result;
      }
    }

    this.storeMessage = function(property, message, extraPropertyId) {
      var messageString = message.toString();
      var result = false;
      property.error = '';
      property.status = 'ok';
        
      // store original Message
      property.message = messageString;
      property.payload = messageString;
      if (extraPropertyId) { // save extra messages i.e. ../set topic
        if (!property[extraPropertyId]) property[extraPropertyId]=messageString;
      }
        
      // Format Value according to $datatype and $format
      switch (property.$datatype) {
        case undefined :  // datatype not specified
            property.error = '$datatype not specified. Value will be undefined!'
            break;
        case 'integer': // format integer Value
            property.value = Math.floor(Number(message));
            result = true;
            break;
        case 'float': // format float value
            property.value = Number(message);
            result = true;
            break;
        case 'boolean': // format boolean value
            if (message=='true') {
              property.payload = true;
              property.value = 1;
              result = true;
            } else if (message=='false') {
              property.payload = false;
              property.value = 0;
              result = true;
            } else {
              property.error = 'true or false expected for boolean datatype';
            }
            break;
        case 'string': // format string value
            property.value=messageString;
            result = true;
            break;
        case 'enum': // format enum and get number in enum list
            if (property.$format!==undefined) {
              var enumList = property.$format.split(',');
              for (var i=0; i<enumList.length; i++) {
                if (messageString==enumList[i]) {
                  property.value = i;
                  result = true;
                  break;
                }
              }
              if (i>=enumList.length) property.error = 'item: '+messageString+' not found in enum $format: '+property.$format;
            } else {
              property.error = '$format expected to provide comma seperated list of valid payloads';
            }
            break;
        case 'color': // format color
            switch (property.$format) {
              case undefined: // format not specified
                  property.error = '$format expected to provide color space information (RGB or HSV)';
                  break;
              case 'rgb': // rgb Color
                  var colors = messageString.split(',');
                  if (colors.length!=3) {
                    property.error = 'color value expected as 3 values r,g,b received: '+messageString;
                    break;
                  } else {
                    property.value = {};
                    property.value.r = Number(colors[0]);
                    property.value.g = Number(colors[1]);
                    property.value.b = Number(colors[2]);
                    result = true;
                  }
                  break;
              case 'hsv': // hsv Color
                  var colors = messageString.split(',');
                  if (colors.length!=3) {
                    property.error = 'color value expected as 3 values h,s,v received: '+messageString;
                  } else {
                    property.value = {};
                    property.value.h = Number(colors[0]);
                    property.value.s = Number(colors[1]);
                    property.value.v = Number(colors[2]);
                    result = true;
                  }
                  break;
                    
              // error
              default: property.error = '$format invalid. Expected rgb or hsv received: '+property.$format;
            }
            break;

        default: // $datatype undefined or invalid
            property.value = messageString; // emit message anyway 
            property.error = '$datatype undefined or invalid: '+property.$datatype;
            property.status = 'warning';
      }

      // Set Timing Data
      if (property.timeReceived!==undefined) {
        property.timeLastReading=property.timeReceived;
      } else {
        property.timeLastReading=Date.now();
      }
      property.timeReceived=Date.now();
      property.timeRefresh=property.timeReceived-property.timeLastReading;
      
      // Set message Counter
      if (property.msgCounter!==undefined) {
        property.msgCounter++;
      } else {
        property.msgCounter=1;
      }
      return result;
    }

    this.buildMsgOut= function(deviceId, nodeId, propertyId, homieProperty) {

      var msgOut= {device: deviceId, node: nodeId, property: propertyId};
      msgOut.topic = deviceId+"/"+nodeId+"/"+propertyId;
      msgOut.message = homieProperty.message;
      msgOut.payload = homieProperty.payload;
      msgOut.value = homieProperty.value;
      msgOut.predicted = homieProperty.predicted;
      
      // timing data
      msgOut.timing = {timeReceived: homieProperty.timeReceived};
      msgOut.timing.interval = homieProperty.timeRefresh;
      msgOut.timing.msgCounter = homieProperty.msgCounter;
      
      // error data
      msgOut.error = {status: homieProperty.status};
      msgOut.error.errorText = homieProperty.error;
      
      // attribute data
      msgOut.attributes = {name: homieProperty.$name};
      msgOut.attributes.datatype = homieProperty.$datatype;
      msgOut.attributes.format = homieProperty.$format;
      msgOut.attributes.settable = homieProperty.$settable;
      msgOut.attributes.retained = homieProperty.$retained;
      msgOut.attributes.unit = homieProperty.$unit;

      return msgOut;
    }
    
    this.messageArrived = function (topic, message) {
      var splitted = topic.split('/');
      var deviceName = splitted[1];
      var nodeId = splitted[2] || '';
      var propertyId = splitted[3] || '';
      var property = splitted[4] || '';
      var messageString = message.toString();

      
      if (node.homieDevices===undefined) node.devices=[];

      if (!node.addHomieValue(topic,message)) {
        return false;
      }

      //     console.log("Homie property ("+splitted.length+")  : "+ deviceName +" node:" + nodeId + " property:" + propertyId + " "+ property + "=" + messageString);
      
      switch (splitted.length) {
        case 3 : { // root Object arrived
          if (nodeId=='$nodes') { // list of valid nodes
            if (node.homieData[deviceName].itemList===undefined) node.homieData[deviceName].itemList=[]; // initialize Nodes Array
            var nodes = messageString.split(',');
            for (var i=0; i<nodes.length; i++) {
              node.homieData[deviceName].itemList.push({"name":nodes[i]});
            }
            node.addToLog("info","Homie Device: "+ deviceName +" has "+i+" nodes: "+ messageString);
            node.validateHomie('device', deviceName, '', ''); // validate homie Device when $nodes topic arrives
          }
          break;
        }
        case 4 : { // node Object arrived homie/device/node/#}
          if (propertyId=='$properties') { // list of valid nodes
            node.homieData[deviceName][nodeId].itemList=[]; // initialize Nodes Array
            var nodes = messageString.split(',');
            for (var i=0; i<nodes.length; i++) {
              node.homieData[deviceName][nodeId].itemList.push({"name":nodes[i]});
            }
            node.validateHomie('node', deviceName, nodeId, ''); // validate homie Node when $properties topic arrives
            // console.log("Homie Node  : "+ deviceName +" property " + nodeId + " has "+i+" properties: "+ messageString);
          } else if (propertyId.substr(0,1)!='$') { // value arrived
            var homieProperty = node.homieData[deviceName][nodeId][propertyId];

            if (node.storeMessage(homieProperty, message)) {
              homieProperty.predicted = false;
            } else { // an error accured
              property.error += ' ' + deviceName + '/' + nodeId + '/' + propertyId;
              if (property.state=='ok') property.state = 'error';
            }
            
            var msgOut = node.buildMsgOut(deviceName, nodeId, propertyId, homieProperty);
         
            node.emit('message', deviceName, nodeId, propertyId, msgOut);
          }
          break;
        }
        case 5 : { // node Property arrived 
          if (property.substr(0,1)=='$') {
            node.validateHomie('property', deviceName, nodeId, propertyId); // validate homie Node when $ topic arrive
          } else if (property=='set') {
            node.addToLog("debug","Homie property /set  -> "+ deviceName +" node:" + nodeId + " property:" + propertyId + " "+ property + "=" + messageString);
            
            if (node.storeMessage(node.homieData[deviceName][nodeId][propertyId], message, property)) {
              node.homieData[deviceName][nodeId][propertyId].predicted = true; // set predicted Flag because value received via .../set topic
              var msgOut = node.buildMsgOut(deviceName, nodeId, propertyId, node.homieData[deviceName][nodeId][propertyId]);
              node.emit('message', deviceName, nodeId, propertyId, msgOut);
            } else { // an error accured
              property.error += ' ' + deviceName + '/' + nodeId + '/' + propertyId+'/set';
              if (property.state=='ok') property.state = 'error';
            }
          }
          break;
        }
      } 
    }

    this.client.on('message', this.messageArrived);

    this.client.on('close', function () {
      node.setState('close');
    });

    this.client.on('offline', function () {
      node.addToLog("debug","MQTT offline");
      node.setState('offline');
    });

    this.client.on('error', function () {
      node.addToLog("error","MQTT clinet error");
      node.setState('error');
    });

    this.on('close', function (done) {
      if (node.state === 'connected') {
        node.client.end(true, function () { // need to be force closed, else done never called..
          done();
        });
      } else {
        done();
      }
    });
  }

  RED.nodes.registerType('homie-convention-broker-config', homieDeviceConfig);
};
