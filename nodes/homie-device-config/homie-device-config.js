var ip = require('internal-ip');
var os = require('os');
var mqtt = require('mqtt');

module.exports = function (RED) {
  function homieDeviceConfig (config) {
    RED.nodes.createNode(this, config);
    var node = this;
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
        "*":{"icon":"fa fa-label","type":"string","unit":"","required":false,"default":"","format":""} 
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
    this.homieRoot = config.homieRoot || "homie"; // root topic for homie devices
    this.baseTopic = this.homieRoot + '/' + this.homieName;

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
    this.options.clientId= this.deviceId, 
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
    this.homieFriendlyName = config.homieFriendlyName || "Node-RED"; // friendly name to be identified by homie devices
    this.homieDevices = [];
    this.storeGlobal = config.storeGlobal;
    this.homieNodes = {};
    
    node.addToLog("info","MQTT connect to "+this.brokerurl+" as user "+ this.options.username);
    this.client = mqtt.connect(this.brokerurl, this.options);

    this.sendProperty = function (nodeId, name, value) {
      node.client.publish(node.baseTopic + '/' + nodeId + '/' + name, value, { qos: 2, retain: true });
    };

    this.sendToDevice = function (homieDevice, homieNode, homieProperty, value, setFlag = false) {
      var topic = node.homieRoot + '/' + homieDevice + '/' + homieNode + '/' + homieProperty + ((setFlag) ? "/set" : "");
      node.addToLog("debug","sendToDevice "+topic+"="+value,true);
      node.client.publish(topic, value.toString(), { qos: 2, retain: true });
    };

    this.client.on('connect', function () {
      node.addToLog("info","MQTT connected to "+ node.brokerurl+ " as user "+ (node.options.username) ? (node.options.username) : "anonymous");

      node.setState('connected');
      var memoryUsage=process.memoryUsage();
      node.client.publish(node.baseTopic + '/$state', 'ready', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$homie', '4.0.0', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$name', node.homieFriendlyName, { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$implementation', os.arch(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$localip', ip.v4(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$mac', ip.v4(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$extensions','org.homie.legacy-stats:0.1.1:[4.x],org.homie.legacy-firmware:0.1.1:[4.x]', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$stats/uptime', os.uptime().toString(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$stats/cpuload', os.loadavg()[1].toString(), { qos: 2, retain: true }); // 5min average
      node.client.publish(node.baseTopic + '/$stats/freeheap', (memoryUsage.heapTotal-memoryUsage.heapUsed).toString(), { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$fw/name', 'Node-RED ('+os.platform()+' '+os.release()+')', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$fw/version', RED.version(), { qos: 2, retain: true });

      node.client.subscribe(node.homieRoot + '/#', { qos: 2 });
      node.client.subscribe('$SYS/broker/uptime', {qos : 0 });
      node.client.subscribe('$SYS/broker/version', {qos : 0 });
      node.client.subscribe('$SYS/broker/retained messages', {qos : 0 });
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
      if (nodeId.substr(0,1)==='$') {
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
          if (!currentObject.hasOwnProperty(splitted[i])) currentObject[splitted[i]]={};
          currentObject[splitted[i]].message=message.toString();
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

    this.formatValueToString = function (datatype,format,value) {
      let success = false;
      let resultString;
      switch (datatype) {
        case 'integer': // format integer Value
          resultString=Math.floor(Number(value)).toString();
          success = true;
          break;
        case 'float': // format float value
          resultString=Number(value).toFixed(2).toString();
          success = true;
          break;
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

    this.formatStringToValue = function (datatype,format,property,message) {
      let result = false;
      switch (datatype) {
        case 'integer': // format integer Value
            property.valueBefore = property.value;
            property.value = Math.floor(Number(message));
            result = true;
            break;
        case 'float': // format float value
            property.valueBefore = property.value;
            property.value = Number(message);
            result = true;
            break;
        case 'boolean': // format boolean value
            property.valueBefore = property.value;
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
            property.valueBefore = property.value;
            property.value=message;
            result = true;
            break;
        case 'enum': // format enum and get number in enum list
            if (format!==undefined) {
              var enumList = format.split(',');
              if (enumList.includes(message)) {
                  property.valueBefore = property.value;
                  property.value = enumList.indexOf(message);
                  property.payload = message; // keep the message as payload;
                  result = true;
                  break;
                } else property.error = 'item: '+message+' not found in enum $format: '+format;
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
                  var colors = message.split(',');
                  if (colors.length!=3) {
                    property.error = 'color value expected as 3 values r,g,b received: '+message;
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
                  var colors = message.split(',');
                  if (colors.length!=3) {
                    property.error = 'color value expected as 3 values h,s,v received: '+message;
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
      result = node.formatStringToValue(property.$datatype,property.$format,property,messageString);

      if (!result) {
        if (node.homieExDef.hasOwnProperty(property.nodeId)) {
          if (node.homieExDef[property.nodeId].hasOwnProperty("type")) {
            property.valueBefore = property.value;
            property.value = node.formatProperty(messageString,node.homieExDef[property.nodeId].type);
          }
        } else {
          property.valueBefore = property.value;
          property.value = messageString; // emit message anyway 
          property.error = '$datatype undefined or invalid: '+property.$datatype;
          property.status = 'warning';
        }
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
      msgOut.valueBefore = homieProperty.valueBefore;
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
 
    this.formatProperty = function (payload,type) {
      var result = payload;
      switch (type) {
        case 'integer':
          result=Math.floor(Number(payload));
          break;
        case 'float':
          break;
        case 'boolean':
          result=(payload.toLowerCase==='true' || payload==1) ? true : false;
          break;
        case 'array':
          result=payload.split(',');
      }
      return result;
    }

    this.messageArrived = function (topic, message) {
      var messageString = message.toString();
      if (messageString==="") return; // nothing to do (payload===undefined);
    
      // special mqtt broker values (treat $sys messages from broker as homie device)
      switch (topic){
        case '$SYS/broker/uptime':
          topic = "homie/"+node.name+"/$stats/uptime";
          message = parseInt(message);
          break;
        case '$SYS/broker/version':
          topic = "homie/"+node.name+"/$fw/name";
          break;
      }
      var splitted = topic.split('/');
      var deviceName = splitted[1];
      var nodeId = splitted[2] || '';
      var propertyId = splitted[3] || '';
      var property = splitted[4] || '';


      var stateMsg = {
        "topic": deviceName+'/'+nodeId,
        "deviceId": deviceName,
        "nodeId": nodeId,
        "payload": messageString
      }
      
      if (node.homieDevices===undefined) node.devices=[];

      if (!node.addHomieValue(topic,message)) {
        return false;
      }

      if (deviceName===node.homieName && !topic.includes('$')) {
        node.emit('redHomieMessage', {"topic":topic,"payload":messageString});
      }

      switch (splitted.length) {
        case 3 : { // root Object arrived
          if (nodeId=='$nodes') { // list of valid nodes
            var nodes = messageString.split(',');
            for (var i=0; i<nodes.length; i++) {
              node.pushToItemList(node.homieData[deviceName].itemList,nodes[i],nodes[i]);
            }
            node.addToLog("info","Homie Device: "+ deviceName +" has "+i+" nodes: "+ messageString);
//            node.validateHomie('device', deviceName, '', '', true); // validate homie Device when $nodes topic arrives
          } 
          if (node.homieExDef.hasOwnProperty(nodeId)) {
            // build first level state message
            stateMsg.topic= node.brokerurl+'/'+node.homieRoot+'/'+deviceName;
            stateMsg.propertyId= nodeId;
            stateMsg.value= node.formatProperty(messageString,node.homieExDef[nodeId].type);
            stateMsg.broker= node.name;
            stateMsg.brokerUrl= node.brokerurl;
            stateMsg.homieRoot= node.homieRoot;
            stateMsg.state= {"$name":deviceName};
            stateMsg.state[nodeId]= stateMsg.value;
            if (nodeId==='$state' && node.homieExDef[nodeId].hasOwnProperty('format') && node.homieExDef[nodeId].format.hasOwnProperty(messageString)) {
              stateMsg.state[nodeId+'Icon']=node.homieExDef[nodeId].format[messageString];
            }
            node.emit('stateMessage', stateMsg);
            return;
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
            var emitMsg = 'message';

            if (nodeId.substr(0,1)!='$' || node.homieExDef.hasOwnProperty(nodeId)) { // if this is not an extension $fw or $stats or $....
              if (node.homieExDef.hasOwnProperty(nodeId)) {
                // add extension to itemList
                node.pushToItemList(node.homieData[deviceName].itemList,nodeId,nodeId+" extension");
                // add extension property to itemList
                if (!node.homieData[deviceName][nodeId].itemList) node.homieData[deviceName][nodeId].itemList=[];
                node.homieData[deviceName][nodeId].nodeId=nodeId;
                node.pushToItemList(node.homieData[deviceName][nodeId].itemList,propertyId,nodeId+'/'+propertyId);
                emitMsg = 'stateMessage'
                homieProperty.extraId=nodeId;
                
                var extraConfig=node.homieExDef[nodeId];
                if (extraConfig.hasOwnProperty(propertyId)) extraConfig=extraConfig[propertyId];
                homieProperty.$datatype=extraConfig.type;
                homieProperty.$unit=extraConfig.unit;
                homieProperty.$format=extraConfig.format; 
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
            
            node.emit(emitMsg, msgOut);
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
            } else { // an error occurred
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
