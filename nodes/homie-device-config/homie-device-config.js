var ip = require('internal-ip');
var mqtt = require('mqtt');

module.exports = function (RED) {
  function homieDeviceConfig (config) {
    RED.nodes.createNode(this, config);
    var node = this;
    
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
    
    this.state = 'disconnected';
    this.setState = function (state) {
      node.state = state;
      node.emit('state', state);
    };  
    this.deviceId = config['device-id'];
    this.name = config.name;
    
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
    this.options.username= this.credentials.username,
    this.options.password= this.credentials.password,
    this.options.clientId= this.deviceId, 
    this.options.will= {
      topic: this.baseTopic + '/$state', 
      payload: 'away', 
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
    this.homieName = config.homieName || "Node-RED"; // name to be identified by homie devices
    this.homieRoot = config.homieRoot || "homie"; // root topic for homie devices
    this.homieDevices = [];
    this.baseTopic = this.homieRoot + '/' + this.homieName;
    this.storeGlobal = config.storeGlobal;
    
    node.addToLog("info","MQTT connect to "+this.brokerurl+" as user "+(this.credentials.username) ? this.credentials.username : "anonymous");
    this.client = mqtt.connect(this.brokerurl, this.options);

    this.sendProperty = function (nodeId, name, value) {
      node.client.publish(node.baseTopic + '/' + nodeId + '/' + name, value, { qos: 2, retain: true });
    };

    this.sendToDevice = function (homieDevice, homieNode, homieProperty, value) {
      var topic = node.homieRoot + '/' + homieDevice + '/' + homieNode + '/' + homieProperty +'/set';
      node.addToLog("debug","sendToDevice "+topic+"="+value,true);
      node.client.publish(topic, value.toString(), { qos: 2, retain: true });
    };

    this.client.on('connect', function () {
      node.addToLog("info","MQTT connected to "+ node.brokerurl);

      node.setState('connected');

      node.client.publish(node.baseTopic + '/$state', 'ready', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$name', node.name, { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$localip', ip.v4(), { qos: 2, retain: true });

      node.client.subscribe(node.homieRoot + '/#', { qos: 2 });
    });

    this.getDeviceID= function (deviceName) {
      var homieData = node.homieData;
      for (var deviceId in homieData) {
        if (homieData[deviceId].$name==deviceName) return deviceId;
      }
      return deviceName;
    }
  
    
    this.getNodeID= function (deviceName, nodeName) {
      var homieData =node.homieData;
      var deviceId = node.getDeviceID(deviceName)
      if (!deviceId) return undefined;
      for (var i=0; i<homieData[deviceId].itemList.length; i++) {
        if (homieData[deviceId][homieData[deviceId].itemList[i].name].$name==nodeName) return homieData[deviceId].itemList[i].name;
      }
      return nodeName;
    }
  
    this.getPropertyID= function (deviceName, nodeName, propertyName) {
      var homieData =node.homieData;
      var deviceId = node.getDeviceID(deviceName)
      if (!deviceId) return undefined;
      var nodeId = node.getNodeID(deviceName,nodeName);
      if (!nodeId) return undefined;
      for (var i=0; i<homieData[deviceId][nodeId].itemList.length; i++) {
        if (homieData[deviceId][nodeId][homieData[deviceId][nodeId].itemList[i].name].$name==propertyName) return homieData[deviceId][nodeId].itemList[i].name;
      }
      return propertyName;
    }
  
    this.getAllIDs= function (deviceName, nodeName, propertyName) {
      var deviceId = node.getDeviceID(deviceName)
      if (!deviceId) return undefined;
      var nodeId = node.getNodeID(deviceName,nodeName);
      if (!nodeId) return undefined;
      var propertyId = node.getPropertyID(deviceName,nodeName,propertyName);
      if (!propertyId) return undefined;
  
      return {"deviceId": deviceId, "nodeId": nodeId, "propertyId": propertyId};;
    }

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
        node.homieData[deviceId]={"deviceId":deviceId,
                                  itemList: [], 
                                  $extensions:"",
                                  extensionList: [], 
                                  validated: false, 
                                  validationError: "new Device, waiting for additional data"};
      }
      if (globalDevices && !globalDevices[deviceId]) {
        globalDevices[deviceId]={"deviceId": deviceId};
      }
      if (node.homieDevices===undefined) node.homieDevices=[];
      // add new Devices to homieDevices array
      if (!node.itemExists(node.homieDevices,'value',deviceId)) node.homieDevices.push({"name":deviceId,"value":deviceId});

      var homieDevice=node.homieData[deviceId];

      /* new code!----------------------

      var currentObject=homieDevice;
      if (globalDevices) {
        var currentGlobal=globalDevices[deviceId];
      }

      for (var i=2; i<splitted.length; i++) {
        if (!currentObject[splitted[i]]) {
          switch (i) {
            case 3: currentObject[splitted[i]]={"nodeId":splitted[i], validated: false, validationError: "new Node, waiting for additional data"};
              break;
            case 4: currentObject[splitted[i]]={"propertyId":propertyId, $format:"", $settable:false, $retained:true, $unit:"", validated: false, validatedFormat: false, validatedUnit: false, validationError: "new Node, waiting for additional data"};
              break;
            default: currentObject[splitted[i]]={};
          }
        }
        currentObject=currentObject[splitted[i]];
        // add to global context
        if (globalDevices) {
          if (!currentGlobal[splitted[i]]) currentGlobal[splitted[i]]={};
          currentGlobal=currentGlobal[splitted[i]];
        }
      }
      i=splitted.length-1;
      if (splitted[i].substr(0,1)=='$') {
        currentObject=message.toString();
        if (globalDevices) currentGlobal=message.toString();
        node.addToLog("info","addHomieValue: "+topic+"="+message.toString());
      } else {
        node.addToLog("info",i);
        currentObject.message=message.toString();
        if (globalDevices) currentGlobal.message=message.toString();
      }

      return true;
*/
      if (nodeId.substr(0,1)=='$') {
        if (splitted.length < 4) {
          homieDevice[nodeId]=message.toString();
          if (globalDevices) globalDevices[deviceId][nodeId]=message.toString();
          node.addToLog("debug",deviceId+" "+nodeId+"="+message.toString());
        } else { // extensions or homie 3.0.x
          node.addToLog("debug","Extension found "+topic+"="+message.toString());
          if (typeof homieDevice[nodeId] !== "object") homieDevice[nodeId]={};
          var currentObject=homieDevice[nodeId];
          if (globalDevices) {
            if (typeof globalDevices[deviceId][nodeId] !== "object") globalDevices[deviceId][nodeId]={};
            var currentGlobal=globalDevices[deviceId][nodeId];
          }
          for (var i=3; i<splitted.length-1; i++) {
            if (!currentObject[splitted[i]]) currentObject[splitted[i]]={};
            currentObject=currentObject[splitted[i]];
            if (globalDevices) {
              if (!currentGlobal[splitted[i]]) currentGlobal[splitted[i]]={};
              currentGlobal=currentGlobal[splitted[i]];
            }
          }
          currentObject[splitted[i]]=message.toString();
          if (globalDevices) currentGlobal[splitted[i]]=message.toString();
        }
      } else {
        if (!homieDevice[nodeId]) { // initialize Node
          homieDevice[nodeId]={"nodeId":nodeId,
                              itemList: [],
                              validated: false, 
                              validationError: "new Node, waiting for additional data"};
          if (globalDevices && !globalDevices[deviceId][nodeId]) globalDevices[deviceId][nodeId]={"nodeId": nodeId};
        }
        var homieNode=homieDevice[nodeId];
        if (propertyId.substr(0,1)=='$') {
          homieNode[propertyId]=message.toString();
          if (globalDevices) globalDevices[deviceId][nodeId][propertyId]=message.toString();
          node.addToLog("debug",deviceId+"/"+nodeId+" "+propertyId+"="+message.toString());
        } else {
          if (!homieNode[propertyId]) { // initialize property
            homieNode[propertyId]={"propertyId":propertyId, 
                                  itemList: [],
                                  $format:"", 
                                  $settable:false, 
                                  $retained:true, 
                                  $unit:"", 
                                  validated: false, 
                                  validatedFormat: false, 
                                  validatedUnit: false, 
                                  validationError: "new Node, waiting for additional data"};
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
    
    this.validateHomie = function(homieType, deviceName, nodeName, propertyName, validateForward) { // validate homie device / node or property
      
      var validateProperty = function(currentProperty,currentNode,currentDevice) {
        if (!currentProperty) return false;
        if (currentNode.nodeId.substr(0,1)=='$') { // no validation of extensions
          currentProperty.validated=true;
          return true;
        }
        // if (currentProperty.validated) return true; // already validated
        currentProperty.validated=false;

        if (currentProperty.$name===undefined)  {currentProperty.validationError="$name not specified"; return false;}
          else if (currentNode && currentNode.itemList) { // update name in property list
            currentNode.itemList.forEach(function(item) {
              if (item.value==currentProperty.nodeId) {
                item.name=currentProperty.$name;
                return;
              };
          });
        }
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

        // validate subsequential node if not forward validation
        if (!validateForward) {
          validateNode(currentNode, currentDevice);
        }

        node.addToLog("trace","Validation of PROPERTY: "+deviceName+"/"+currentNode.$name+"/"+currentProperty.$name+" success! ("+propertyName+")");
        currentProperty.validationError = "";
        currentProperty.validated = true;
        return true;
      }

      var validateNode = function (currentNode,currentDevice) {
        if (!currentNode) return false;
        currentNode.validationError="";
        if (currentNode.validated) return true; // already validated
        if (currentNode.nodeId.substr(0,1)=='$') { // no validation of extensions
          currentNode.validated=true;
          return true;
        }

        if (currentNode.$name===undefined) currentNode.validationError+="$name ";
          else if (currentDevice && currentDevice.itemList) { // update name in node list
            currentDevice.itemList.forEach(function(item) {
              if (item.value==currentNode.nodeId) {
                item.name=currentNode.$name;
                return;
              };
          });
        }
        if (currentNode.$type===undefined) currentNode.validationError+="$type ";
        if (currentNode.$properties===undefined) currentNode.validationError+="$properties ";
        if (currentNode.validationError.length>0) {currentNode.validationError+="not specified"; return false;}

        // validate all properties of this node (forward) or device
        if (validateForward){
          currentNode.itemList.forEach(function(item) {
            propertyName=item.name;
            result=validateProperty(currentNode[item.value],currentNode,currentDevice);
            if (!result) {
              currentNode.validationError+=" | validation of property: "+item.value+" failed!";
              return;
            }
          });
          if (!result) return;
        } else {
          validateDevice(currentDevice);
        }
        node.addToLog("info","Validation of NODE: "+currentDevice.$name+"/"+currentNode.$name+" success!");
        currentNode.validationError = "";
        currentNode.validated = true;
        return true;
      }

      var validateDevice = function(currentDevice) {
        var result = true;
        if (currentDevice===undefined) return false;
        if (currentDevice.validated) return true; // already validated
        currentDevice.validationError="";
        if (currentDevice.$homie===undefined) currentDevice.validationError+="$homie ";
        if (currentDevice.$name===undefined) currentDevice.validationError+="$name ";
        if (currentDevice.$state===undefined) currentDevice.validationError+="$state ";
        if (currentDevice.$nodes===undefined) currentDevice.validationError+="$nodes ";
        if (currentDevice.validationError.length>0) {currentDevice.validationError+="not specified"; return false;}

        if ((currentDevice.itemList===undefined)) {currentDevice.validationError="internal list of nodes not defined"; return false;}

        // validate all nodes of this device
        if (validateForward){
          currentDevice.itemList.forEach(function(item) {
            result=validateNode(currentDevice[item.value],currentDevice);
            if (!result) {
              currentDevice.validationError+=" | validation of node: "+item.value+" failed!";
              return;
            }
          });
          if (!result) return;
        }

        // update name in device List
        node.homieDevices.forEach(function(item) {
          if (item.value==currentDevice.deviceId) {
            item.name=currentDevice.$name;
            return;
          };
        });

        node.addToLog("info","Validation of DEVICE: "+deviceName+" success!");
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
            node.emit('validatedDevice', {"deviceId":deviceName, "nodeId":nodeName, "propertyId":propertyName});
          } else {
            node.addToLog("trace","Validation of Device:"+deviceName+" failed! ("+node.homieData[deviceName].validationError+")");
           }
          return result;
        case 'node' :    
          result= validateNode(node.homieData[deviceName][nodeName],node.homieData[deviceName]);
          if (result) {
 //           node.emit('validatedNode', deviceName, nodeName , '', '');
          } else {
            node.addToLog("trace","Validation of Node: "+deviceName+"/"+nodeName+" failed! ("+node.homieData[deviceName][nodeName].validationError+")");
           }
          return result;
        case 'property': 
          result= validateProperty(node.homieData[deviceName][nodeName][propertyName],node.homieData[deviceName][nodeName],node.homieData[deviceName]);
          
          if (result) {
 //           node.emit('validatedProperty', {"deviceId":deviceName, "nodeId":nodeName, "propertyId":propertyName});
          } else {
            node.addToLog("trace","Validation of Property:"+deviceName+"/"+nodeName+"/"+propertyName+" failed! ("
              +(node.homieData[deviceName][nodeName][propertyName]) ? 
                ((node.homieData[deviceName][nodeName][propertyName]) ? 
                  node.homieData[deviceName][nodeName][propertyName].validationError 
                  : "undefined")
                : "undefined"+")");
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
              property.error = '$format expected to provide comma separated list of valid payloads';
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
                    property.value.s = Number(colors[1])/100;
                    property.value.v = Number(colors[2])/100;
                    property.value.a = 1;
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

      var msgOut= {deviceId: deviceId, nodeId: nodeId, propertyId: propertyId};
      var extension= (nodeId.substr(0,1)=='$')
      msgOut.deviceName = node.homieData[deviceId].$name;
      if (!extension) {
        msgOut.nodeName = node.homieData[deviceId][nodeId].$name;
        msgOut.propertyName = node.homieData[deviceId][nodeId][propertyId].$name;
      } else {
        msgOut.nodeName = nodeId;
        msgOut.propertyName = propertyId;
      }
      msgOut.topic = node.homieData[deviceId].$name+"/"+node.homieData[deviceId][nodeId].$name+"/"+node.homieData[deviceId][nodeId][propertyId].$name;
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
      
      if (!extension) {
        // attribute data
        msgOut.attributes = {name: homieProperty.$name};
        msgOut.attributes.datatype = homieProperty.$datatype;
        msgOut.attributes.format = homieProperty.$format;
        msgOut.attributes.settable = homieProperty.$settable;
        msgOut.attributes.retained = homieProperty.$retained;
        msgOut.attributes.unit = homieProperty.$unit;
      }

      return msgOut;
    }
    
    // ----------------------------------------------------------
    // New Message via MQTT
    // ----------------------------------------------------------

    this.pushToItemList= function(itemList,itemValue,itemName) {
      var itemExist=false
      itemList.forEach(function(item){
        if (item.value==itemValue) {
          itemExist=true;
          return
        }
      });
      if (!itemExist) itemList.push({"name":itemName,"value":itemValue});
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

      switch (splitted.length) {
        case 3 : { // root Object arrived
          if (nodeId=='$nodes') { // list of valid nodes
            var nodes = messageString.split(',');
            for (var i=0; i<nodes.length; i++) {
              // node.homieData[deviceName].itemList.push({"name":nodes[i],"value":nodes[i]}); // don't have $name yet. Will fix during validation
              node.pushToItemList(node.homieData[deviceName].itemList,nodes[i],nodes[i]);
            }
            node.addToLog("info","Homie Device: "+ deviceName +" has "+i+" nodes: "+ messageString);
//            node.validateHomie('device', deviceName, '', '', true); // validate homie Device when $nodes topic arrives
          }
          break;
        }
        case 4 : { // node Object arrived homie/device/node/#}
          if (propertyId=='$properties') { // list of valid nodes
            var nodes = messageString.split(',');
            for (var i=0; i<nodes.length; i++) {
//              node.homieData[deviceName][nodeId].itemList.push({"name":nodes[i],"value":nodes[i]}); // don't have $name yet. Will fix during validation
              node.pushToItemList(node.homieData[deviceName][nodeId].itemList,nodes[i],nodes[i]);
            }
//            node.validateHomie('node', deviceName, nodeId, '', true); // validate homie Node when $properties topic arrives
          } else if (propertyId.substr(0,1)!='$') { // value arrived
            var homieProperty = node.homieData[deviceName][nodeId][propertyId];

            if (nodeId.substr(0,1)!='$' || nodeId=="$stats" || nodeId=="$fw" || nodeId=="$implementation") { // if this is not an extension $fw or $stats or $....
              if (nodeId=="$stats" || nodeId=="$fw" || nodeId=="$implementation") {
                // add extension to itemList
                node.pushToItemList(node.homieData[deviceName].itemList,nodeId,nodeId+" extension");
                // add extension property to itemList
                if (!node.homieData[deviceName][nodeId].itemList) node.homieData[deviceName][nodeId].itemList=[];
                node.homieData[deviceName][nodeId].nodeId=nodeId;
                node.pushToItemList(node.homieData[deviceName][nodeId].itemList,propertyId,nodeId+'/'+propertyId);
                var homieProperty = node.homieData[deviceName][nodeId]
              }

              if (node.storeMessage(homieProperty, message)) {
                homieProperty.propertyId=propertyId;
                homieProperty.predicted = false;
              } else { // an error accrued
                property.error += ' ' + deviceName + '/' + nodeId + '/' + propertyId;
                if (property.state=='ok') property.state = 'error';
              }
            }
           
            var msgOut = node.buildMsgOut(deviceName, nodeId, propertyId, homieProperty);
            node.emit('message', msgOut);
          }
          break;
        }
        case 5 : { // node Property arrived 
          if (property.substr(0,1)=='$') {
//            node.validateHomie('property', deviceName, nodeId, propertyId,false); // validate homie Node when $ topic arrive
          } else if (property=='set') {
            node.addToLog("debug","Homie property /set  -> "+ deviceName +" node:" + nodeId + " property:" + propertyId + " "+ property + "=" + messageString);
            
            if (node.storeMessage(node.homieData[deviceName][nodeId][propertyId], message, property)) {
              node.homieData[deviceName][nodeId][propertyId].predicted = true; // set predicted Flag because value received via .../set topic
              var msgOut = node.buildMsgOut(deviceName, nodeId, propertyId, node.homieData[deviceName][nodeId][propertyId]);
              node.emit('message', msgOut);
            } else { // an error accured
              property.error += ' ' + deviceName + '/' + nodeId + '/' + propertyId+'/set';
              if (property.state=='ok') property.state = 'error';
            }
          }
          break;
        }
      }
      
      // always validate homie state
      node.validateHomie('device', deviceName, nodeId, propertyId, true);
      

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
        node.client.end(true, function () { // need to be force closed, else done never called..
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
