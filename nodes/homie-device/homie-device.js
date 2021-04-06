module.exports = function (RED) {
  function homieDevice (config) {
    RED.nodes.createNode(this, config);
    var node = this;
    this.startupSent = false; // flag if startup messages are sent
    
    this.handleDeviceState = function (state) {
      switch (state) {
        case 'disconnected':
          node.status({ fill: 'red', shape: 'ring', text: 'MQTT disconnected' });
          node.startupSent = false;
          break;
        default:
          node.status({ fill: 'green', shape: 'dot', text: state });
          break;
      }
    };

    this.log = {};
    this.broker = RED.nodes.getNode(config.broker);
    this.baseID = config.baseID || '[any]';
    this.deviceID = config.deviceID || '[any]';
    this.nodeID=config.nodeID || '[any]';
    this.propertyID=config.propertyID || '[any]';
    this.extensionID=config.extensionID || '[none]';
    this.selectedNodes = config.selectedNodes || {};
    this.filterTree = config.filterTree || false;
    this.infoError=config.infoError; // include Error messages
    this.infoAttributes=config.infoAttributes; // include Attribute information
    this.infoTiming=config.infoTiming; // include Timing messages
    this.infoMqtt=config.infoMqtt; // include MQTT messages
    this.sendChangesOnly=config.sendChangesOnly; // include Timing messages
    this.blockTimeout= Number(config.blockTimeout) || 0; // don't send new messages until last message is confirmed

    if ((typeof config.settable)=="string")  this.settable=(config.settable=="true");
     else this.settable=config.settable; // configure node as settable
    if (this.settable) this.inputs = 1;
      else this.inputs = 0;

    this.handleDeviceState(this.broker.state);

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
        RED.log[type]("[homie.device:"+node.name+"] "+node.log[type]);
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

    // ------------------------------------------
    // send startup messages
    // ------------------------------------------

    this.startupMessages = function (validatedBase, validatedDevice, validatedNode, validatedProperty) {
      
      var sendProperty = function (currentBase, currentDevice, currentNode, currentProperty) {
        if (node.uiNode=="none" && node.addLabel=="none") return false; // no startup messages necessary
        var msgOut = {};
        var homieDevice= node.broker.homieData[currentBase][currentDevice];
        if (!homieDevice) {
          node.addToLog("error","startupMessages:sendProperty:"+currentBase+"/"+currentDevice+"/"+currentNode+"/"+currentProperty+" failed!");
          return false;
        }
        if (homieDevice[currentNode]!==undefined) {
          var homieNode=homieDevice[currentNode];
          if (homieNode[currentProperty]!==undefined) {
            var homieProperty=homieNode[currentProperty];
            if (homieProperty.$datatype!==undefined) {
              node.addToLog("info","startupMessages:sendProperty:"+currentBase+"/"+currentDevice+"/"+currentNode+"/"+currentProperty);
 
              // prepare startup message
              msgOut={"msgType":"startup",
                      "baseId": currentBase, 
                      "deviceId": currentDevice, 
                      "nodeId": currentNode,
                      "propertyId": currentProperty,
                      "deviceName": homieDevice.$name,
                      "nodeName": homieNode.$name,
                      "propertyName": homieProperty.$name};
              if (!msgOut.deviceName ||
                  !msgOut.nodeName ||
                  !msgOut.propertyName) return;        

              // add ui controls
              if (node.uiNode!="none") node.addUiControl(msgOut);

              if (homieProperty.payload) msgOut.payload = homieProperty.payload;
              if (homieProperty.value) msgOut.value = homieProperty.value;
            
              node.sendLogs();

              // send startup message;
              if (msgOut.error) node.send([null,msgOut]);
              else node.send([msgOut,null]);
              node.startupSent= true;
            }
          }
        }
      }

      var sendNode = function (currentBase, currentDevice,currentNode,currentProperty) {
        var homieDevice= node.broker.homieData[currentBase][currentDevice];
        if (homieDevice!==undefined) {
          var homieNode=homieDevice[currentNode];
          if (currentProperty=='[any]') { // check all properties if startup messages to be send
            for (var propertyName in homieNode) {
              sendProperty(currentBase, currentDevice,currentNode,propertyName);
            } // single property
          } else sendProperty(currentBase, currentDevice,currentNode,currentProperty);
        }      
      }

      var sendDevice = function (currentBase, currentDevice,currentNode,currentProperty) {
        var homieDevice= node.broker.homieData[currentBase][currentDevice];
        if (homieDevice!==undefined && homieDevice._itemList!==undefined) {
          if (currentNode=='[any]') { // check all nodes if they contain properties with startup messages to be send
            for (var nodeName in homieDevice._itemList) {
              sendNode(currentBase, currentDevice,homieDevice._itemList[nodeName].value,currentProperty);
            } // single Node
          } else sendNode(currentBase, currentDevice,currentNode,currentProperty);
        }      
      }

      if (node.broker===undefined || node.broker.homieData===undefined || node.broker.homieData[validatedBase]===undefined || node.broker.homieData[validatedBase][validatedDevice]===undefined) { //|| node.broker.homieData[validatedDevice]._itemList===undefined
        node.addToLog("error","startupMessages(node) homieData not found. "+validatedDevice);
      } else {
        if (validatedProperty) { // send for single property
          sendProperty(validatedBase, validatedDevice,validatedNode,validatedProperty);
        } else if (node.deviceID=='[any]') { // loop through devices
          for (var baseName in node.broker.homieData) {
            for (var deviceName in node.broker.homieData[baseName]) { // send to first match
              if (validatedDevice==deviceName) {
                sendDevice(baseName,deviceName,node.nodeID,node.propertyID);
                break;
              }
            }
          }
        } else { // single Device
          if (validatedDevice==node.deviceID) sendDevice(node.baseID,node.deviceID,node.nodeID,node.propertyID);
        }
      }
      node.sendLogs();
    };

    this.broker.on('validatedDevice', function (msgOut) {
      if (node.startupSent) return;
      node.startupMessages(msgOut.deviceId);
      node.startupSent= true;
    });

    this.broker.on('validatedProperty', function (msgOut) {
      if (node.startupSent) return;
      if ((node.deviceID=="[any]" || msgOut.deviceId==node.deviceID) &&
          (node.nodeID=="[any]" || msgOut.nodeId==node.nodeID) &&
          (node.propertyID=="[any]" || msgOut.propertyId==node.propertyID)) {
        node.startupMessages(msgOut.deviceId,msgOut.nodeId,msgOut.propertyId);
        node.startupSent= true;
      }
    });

    // convert one color to another using uiFormatColor
    // dose NOT convert color spaces (i.e. rgb -> hsv)
    this.formatColor= function(property, payloadIn, msgOut) {
      if (typeof payloadIn == "object") {
        if (payloadIn.h!==undefined && payloadIn.s!==undefined && payloadIn.v!==undefined) {
          if (property.$format=='hsv') {
            msgOut.homiePayload=Math.floor(payloadIn.h)+","+(Math.floor(payloadIn.s*100))+","+(Math.floor(payloadIn.v*100));
            switch (node.uiFormatColor) {
              case 'homieString': // s and v range is 0-100
                msgOut.payload=payloadIn.h+","+(Math.floor(payloadIn.s*100))+","+(Math.floor(payloadIn.v*100));
                break;
              case 'nodeRedObject':
                msgOut.payload={};
                msgOut.payload.h=payloadIn.h || 0;
                msgOut.payload.s=payloadIn.s || 0;
                msgOut.payload.v=payloadIn.v || 0;
                msgOut.payload.a=payloadIn.a || 1;
                break;
              case 'nodeRedString':
                msgOut.payload="hsv("+Math.floor(payloadIn.h)+","+(Math.floor(payloadIn.s*100))+","+(Math.floor(payloadIn.v*100))+")";
                break;
            }
          } else { 
            return "cannot convert hsv into "+property.$format;
          }
        } else if (payloadIn.r!==undefined && payloadIn.g!==undefined && payloadIn.b!==undefined) {
          if (property.$format=='rgb') {
            msgOut.homiePayload=Math.floor(payloadIn.r)+","+Math.floor(payloadIn.g)+","+Math.floor(payloadIn.b);
            switch (node.uiFormatColor) {
              case 'homieString':
                msgOut.payload=payloadIn.r+","+payloadIn.g+","+payloadIn.b;
                break;
              case 'nodeRedObject':
                msgOut.payload={};
                msgOut.payload.r=payloadIn.r || 0;
                msgOut.payload.g=payloadIn.g || 0;
                msgOut.payload.b=payloadIn.b || 0;
                msgOut.payload.a=payloadIn.a || 1;
                break;
              case 'nodeRedString':
                msgOut.payload="rgb("+Math.floor(payloadIn.r)+","+Math.floor(payloadIn.g)+","+Math.floor(payloadIn.b)+")";
                break;
            }           
          } else {
            return "cannot convert rgb into "+property.$format;
          }
        } else {
          return "cannot detect color format in msg.payload object";
        }
      } else if (typeof payloadIn == "string") {
        var colors = payloadIn.split(',');
        var lastParameter = colors.length-1;
        var inColorFormat= property.$format;
        
        if (lastParameter>1) { // only accept color strings with min 3 parameters
          if (colors[0].includes('(')) {
            inColorFormat=colors[0].substring(0,colors[0].indexOf('('));
            colors[0]=colors[0].substring(colors[0].indexOf('(')+1);
          }
          if (colors[lastParameter].includes(')')) colors[lastParameter]=colors[lastParameter].substring(0,colors[lastParameter].indexOf(')'));
          if (inColorFormat==property.$format) {
            switch (property.$format) {
              case 'rgb': {
                for (var i=0; i<3; i++) {
                  if (Number(colors[i])<0) colors[i]=0;
                  else if (Number(colors[i])>255) colors[i]=255;
                  else colors[i]=Number(colors[i]);
                }
                msgOut.homiePayload=Math.floor(colors[0])+','+Math.floor(colors[1])+','+Math.floor(colors[2]);
                switch (node.uiFormatColor) {
                  case 'homieString':
                    msgOut.payload=msgOut.homiePayload;
                    break;
                  case 'nodeRedObject':
                    msgOut.payload={};
                    msgOut.payload.r=Number(colors[0]) || 0;
                    msgOut.payload.g=Number(colors[1]) || 0;
                    msgOut.payload.b=Number(colors[2]) || 0;
                    msgOut.payload.a=Number(colors[3]) || 1;
                    break;
                  case 'nodeRedString':
                    msgOut.payload="rgb("+Math.floor(colors[0])+','+Math.floor(colors[1])+','+Math.floor(colors[2])+")";
                    break;
                }           
              }
              case('hsv'):
                if (Number(colors[0])<0) colors[0]=0;
                else if (Number(colors[0])>360) colors[0]=360;
                else colors[0]=Number(colors[0]);
                for (var i=1; i<3; i++) {
                  if (colors[i].includes('%')) colors[i]=colors[i].substring(0,colors[i].indexOf('%'));
                  colors[i]=Number(colors[i]);
                  if (Number(colors[i])<0) colors[i]=0;
                  else if (Number(colors[i])>100) colors[i]=100;
                }
                msgOut.homiePayload=Math.floor(colors[0])+','+Math.floor(colors[1])+','+Math.floor(colors[2]);
                switch (node.uiFormatColor) {
                  case 'homieString':
                    msgOut.payload=msgOut.homiePayload;
                    break;
                  case 'nodeRedObject':
                    msgOut.payload={};
                    msgOut.payload.h=Number(colors[0]) || 0;
                    msgOut.payload.s=Number(colors[1])/100 || 0;
                    msgOut.payload.v=Number(colors[2])/100 || 0;
                    msgOut.payload.a=Number(colors[3]) || 1;
                    break;
                  case 'nodeRedString':
                    msgOut.payload="hsv("+Math.floor(colors[0])+','+colors[1]+'%,'+colors[2]+"%)";
                    break;
                }           
                break;
              default:
                msgError.error = "payload "+msg.payload+" could not sent as color because $format="+property.$format+" is not defined as rgb or hsv. Sending anyway.";
                node.send([null,msgError]);        
            }
          } else {
            return "cannot convert "+inColorFormat+" into "+property.$format;
          }
        } else {
          return "can only convert color strings with min 3 parameters ("+payloadIn+")";
        }
      } else {
        return "cannot covert color of type "+typeof payloadIn;
      }
      return "";
    }

    this.releaseBlockTimeout = function(node, property, msg) {
      node.status({ fill: 'blue', shape: 'dot', text: `msg released after ${node.blockTimeout}ms`});
      node.broker.sendToDevice(msg.base,msg.device,msg.node,msg.property,msg.payload,true);
      delete property.blockTimeoutId;
    }

    this.nodeInput = function (msg) {
      var msgError = {status: "error"};
      msgError.function = "input"
      var msgOut = {};
      var splitted = [];
      var setFlag = false;

      var sendToProperty = function (homieNode) {
        if (homieNode!==undefined) {
          if (homieNode[msgOut.property]!==undefined) {
            property = homieNode[msgOut.property];
            if (property.$settable!== undefined) {
              if (property.$settable) {
                if (property.$datatype!==undefined) {
                  switch (property.$datatype) {
                    case ('integer'): // format payload to integer
                    case ('float'):
                      msgOut.payload=Number(msg.payload);
                      if (msgOut.payload===NaN) {
                        msgError.error = "Payload for Property "+msgOut.property+" of Node "+msgOut.node+" $datatyp="+property.$datatype+" but payload is NaN. No output"
                        node.send([null,msgError]);
                        return;      
                      }
                      if (property.$datatype=='integer') msgOut.payload=Math.floor(msgOut.payload); // convert to Integer
                      break;
                    case ('datetime'):
                    case ('duration'):
                    case ('string'):
                      msgOut.payload=msg.payload;
                      break;
                    case ('boolean'): // accept true/false, 0/1, "ON"/"OFF", "on"/"off", "true"/"false", "toggle" empty string to toggle state;
                      msgOut.payload=false;
                      switch (msg.payload) {
                        case (true): msgOut.payload=true;
                          break;
                        case (1): msgOut.payload=true;
                          break;
                        case ('true'): msgOut.payload=true;
                          break;
                        case ('ON'): msgOut.payload=true;
                          break;
                        case ('on'): msgOut.payload=true;
                          break;
                        case ('toggle'): msgOut.payload=!property.value;
                          break;
                        default:
                          if (!(msg.payload==false || msg.payload==0 || msg.payload=='false' || msg.payload=='on' || msg.payload=='ON')) { // no matches at all
                            msgError.error = "payload "+msg.payload+" could not converted to $datatype=boolean. No output";
                            node.send([null,msgError]);
                            return;            
                          }
                      }
                      break;
                    case ('enum'): // $datatype='enum' $format needs to contain comma separated list.
                      if (property.$format===undefined) {
                        msgError.error = "enum property "+msgOut.topic+" has no $format attribute! No output";
                        node.send([null,msgError]);
                        return;  
                      }
                      var enumValues=property.$format.split(',');
                      if (enumValues.length<2) {
                        msgError.error = "enum property "+msgOut.topic+" has only one option! Needs two ore more to be settable! No output";
                        node.send([null,msgError]);
                        return;  
                      }
                      if (msg.payload) { // set to specific value
                        if (enumValues.includes(msg.payload)) { // msg.payload exists in $format! Change state accordingly
                          property.payload=msg.payload;
                          property.value=enumValues.indexOf(msg.payload)
                          /* if (msg.payload==enumValues[0] || msg.payload==enumValues[1]) {
                            property.payload=msg.payload;
                            if (msg.payload==enumValues[0]) property.value=0;
                            else property.value=1;
                          } */
                        } else { // toggle for not matching payload
                          if (property.payload==enumValues[0]) {
                            property.payload=enumValues[1];
                            property.value=1;
                          } else {
                            property.payload=enumValues[0];
                            property.value=0;
                          }
                        }
                      } else { // no payload provided = toggle state
                        if (property.payload==enumValues[0]) {
                          property.payload=enumValues[1];
                          property.value=1;
                        } else {
                          property.payload=enumValues[0];
                          property.value=0;
                        }
                      }
                      msgOut.payload=property.payload;
                      msgOut.value=property.value;
                      break;
                    case ('color'):
                      msgError.error=node.formatColor(property,msg.payload,msgOut);
                      if (msgError.error!="") {
                        msgError.error = "Could not convert color payload ("+ msgError.error+")";
                        node.send([null,msgError]);
                        return;
                      }
                      break;
                  }
                } else { // $datatype not defined! defaults to string
                  msgOut.payload=msg.payload;
                }
              } else {
                msgError.error = "Property "+msgOut.property+" of Node "+msgOut.node+" $settable=false. No output"
                node.send([null,msgError]);
                return;
              }
            } else {
              msgError.error = "Property "+msgOut.property+" of Node "+msgOut.node+" is not a $settable attribute. No output"
              node.send([null,msgError]);
              return;
            }
          } else {
            msgError.error = "Property "+msgOut.property+" of Node "+msgOut.node+" not found. No output"
            node.send([null,msgError]);
            return;
          }
        } else {
          msgError.error = "Node "+msgOut.node+" not found. No output"
          node.send([null,msgError]);
          return;
        }

        if (property.$settable) setFlag=true; 

        if (setFlag && node.blockTimeout>0 && property.predicted===true) {
          node.status({ fill: 'yellow', shape: 'dot', text: `msg queued ${node.blockTimeout}ms`});
          property.lastValue = msgOut.payload;
          if (property.blockTimeoutId!==undefined) clearTimeout(property.blockTimeoutId);
          property.blockTimeoutId = setTimeout(node.releaseBlockTimeout, node.blockTimeout, node, property, msgOut);
          node.addToLog("debug",`msg queued ${msgOut.property}=${msgOut.payload}`);
        } else {
          // save new value as predicted in homieData
          property.value=msgOut.payload; // finally we should have a matching value to send.
          property.lastValue=property.value;
          property.predicted=true; // mark value as predicted;
          msgOut.predicted=property.predicted;
          
          // FIRST send unaltered data to mqtt broker!
          node.addToLog("info",`msg send ${msgOut.property}=${msgOut.payload}`);
          if (msgOut.homiePayload) node.broker.sendToDevice(msgOut.base,msgOut.device,msgOut.node,msgOut.property,msgOut.homiePayload,setFlag); // If a special homie payload exists send this one.
          else  node.broker.sendToDevice(msgOut.base,msgOut.device,msgOut.node,msgOut.property,msgOut.payload,setFlag);
        }
        return;
      }

      var sendByDevice = function (device) {
        if(msgOut.node=="[any]") { // include [any] node. loop through nodes
          for (var i=0; i<device._itemList.length; i++) {
            homieNode=device._itemList[i];
            sendToProperty(homieNode);
          }
        } else {
          homieNode = device[msgOut.node];
          sendToProperty(homieNode);
        } 
        return;
      }
      
      node.addToLog("debug","Message arrived on input! topic="+msg.topic+" payload="+msg.payload);
      if (!msg.hasOwnProperty('topic)')) {
        msg.topic="";
      }
      splitted = msg.topic.split('/');
      setFlag = (splitted[splitted.length-1]=="set");
      if (setFlag) {
        splitted.pop();
      }

      if (msg.topic==="") {
        Object.keys(node.selectedNodes).forEach(key => {
          splitted = key.split('/'); 
          msgOut.property = (splitted.length===0) ? node.propertyID : splitted.pop();
          msgOut.node = (splitted.length===0) ? node.nodeID : splitted.pop();
          msgOut.device = (splitted.length===0) ? node.deviceID : splitted.pop();
          msgOut.base = (splitted.length===0) ? node.baseID : splitted.pop();
          device = node.broker.homieData[msgOut.base][msgOut.device];
          if (device!==undefined) {
            sendByDevice(device);
          } else {
            msgError.error = "Device "+msgOut.base+"/"+msgOut.device+" not found. No output"
            node.send([null,msgError]);
            return;  
          }
        });
        return;
      } else {
        msgOut.property = (splitted.length===0) ? node.propertyID : splitted.pop();
        msgOut.node = (splitted.length===0) ? node.nodeID : splitted.pop();
        msgOut.device = (splitted.length===0) ? node.deviceID : splitted.pop();
        msgOut.base = (splitted.length===0) ? node.baseID : splitted.pop();
      }
      if (msgOut.property == '[any]') {
        msgError.error = "Wildcards are not allowed for /set properties! Received: "+msg.topic+". No output"
        node.send([null,msgError]);
        return;
      }
      if (msgOut.base=="[any]" || msgOut.device=="[any]") { // Include [any] device. loop through devices
        for (var baseName in node.broker.homieData) {
          for (var deviceName in node.broker.homieData[baseName]) {
            device=node.broker.homieData[baseName][deviceName];
            sendByDevice(device);
          }
        }
      } else {
        device = node.broker.homieData[msgOut.base][msgOut.device];
        if (device!==undefined) {
          sendByDevice(device);
        } else {
          msgError.error = "Device "+msgOut.base+"/"+msgOut.device+" not found. No output"
          node.send([null,msgError]);
          return;  
        }
      }

    };

    this.on('input', function(msg) {
      node.nodeInput(msg);
    });

    // Format output Message
    this.broker.on('message', function (msg, send, done) {
      send = send || function() { node.send.apply(node,arguments) }
      node.addToLog("debug","Message arrived from broker topic="+msg.topic+" payload="+msg.payload);

      if (msg===undefined) {
        if (done) done();
        return;
      }
      if (node.filterTree) {
        if (node.baseID!=='[any]' && node.baseID!==msg.baseID) {
          if (done) done();
          return;          
        };
        if (node.deviceID!=='[any]' && node.deviceID!==msg.deviceId) {
          if (done) done();
          return;      
        }
        if (node.nodeID!=='[any]' && node.nodeID!==msg.nodeId) {
          if (done) done();
          return;              
        }
      
        switch (msg.typeId) {
          case 'homieData':
            if (node.propertyID!=='[any]' && node.propertyID!==msg.propertyId) {
              if (done) done();
              return;
            }
            break;
          case 'homieProperty':
            if (node.propertyID!=='[any]' && node.propertyID!==msg.propertyId) {
              if (done) done();
              return;              
            }
            break;
          case 'homieAttribute':
            if (node.extensionID!=='[any]') {
              if (done) done();
              return;  
            }
            break;
          case 'homieExtension':
            if (node.extensionID!=='[any]' && node.extensionID!==msg.extensionId) {
              if (done) done();
              return;  
            }
            break;
          }
      } else {
        if (!Object.keys(node.selectedNodes).find(element => msg.topic.startsWith(element))) {
          if (done) done();
          return;
        }
        if (msg.hasOwnProperty('propertyId') && msg.propertyId.startsWith('$')) {
          if (done) done();
          return;          
        }
      }

      if (node.sendChangesOnly && (msg.property.value === msg.property.valueBefore)) {
        if (done) done();
        return;
      }
      
      switch(msg.error.status) {
        case 'error': node.status({ fill: 'red', shape: 'dot', text: msg.error.errorText});
                      break;
        case 'warning': node.status({ fill: 'yellow', shape: 'dot', text: msg.error.errorText});
                      break;
        case 'ok': if (!node.infoTiming) {
                      node.status({ fill: 'green', shape: 'dot', text: msg.topic + '=' + msg.payload});
                    } else {
                      if (!msg.timing.messages) {
                        node.status({ fill: 'green', shape: 'dot', text: msg.topic + '=' + msg.payload});
                      } else {
                        node.status({ fill: 'green', shape: 'dot', text: '#' + msg.timing.messages.counter + ' (' + Math.floor(msg.timing.messages.interval/1000) + 's) '+ msg.topic + '=' + msg.payload});
                      }
                    }
                    break;
      }

      if (!msg.topic) {
        if (done) done();
        return;
      }

      if (!node.infoTiming) delete msg.timing;
      if (!node.infoAttributes) delete msg.property;
      if (!node.infoMqtt) delete msg.mqtt;
      if (!node.infoError && msg.error.status==='ok') delete msg.error;

      if (!msg.setFlag) {
        try {
          let property = node.broker.homieData[msg.baseId][msg.deviceId][msg.nodeId][msg.propertyId]; 
          if (property.hasOwnProperty("blockTimeoutId")) {
            node.status({ fill: 'blue', shape: 'dot', text: `/set message confirmed`});
            clearTimeout(property.blockTimeoutId);
            delete property.blockTimeoutId;
            node.addToLog('debug',`timer canceled!`);
            property.predicted = false;
            if (property.lastValue != msg.payload) {
              node.addToLog('debug',` Resend ${msg.propertyId}=${property.lastValue}`);
              node.nodeInput({topic:msg.baseId+'/'+msg.deviceId+'/'+msg.nodeId+'/'+msg.propertyId+'/set',payload:property.lastValue});
            };
          }
        } catch (err) {};
      }
      if (msg.error===undefined || msg.error.status!=='error') {
        send([msg,null]);
      } else {
        send([null,msg]); // send error Message only.
      }
      if (done) done();
    });

  }

  RED.nodes.registerType('homie-convention-device', homieDevice);

  // callback functions

  RED.httpAdmin.get("/homieConvention/treeList", RED.auth.needsPermission('homie-convention-device.read'), function(req,res) {
    var config = req.query;
    var broker = RED.nodes.getNode(config.broker);
    var treeList = [];
    var path = '';
    if (typeof config.filterTree=="string") config.filterTree=(config.filterTree==="true");

    var addDefTree = function (def,extension,tree,path) {
      Object.keys(def).forEach(extensionDef => {
        if (extension.hasOwnProperty(extensionDef)) {
          if (def[extensionDef].hasOwnProperty('$datatype')) {
            if (!extensionDef.startsWith('_')) {
              tree.push({
                label: `${extensionDef}=${(extension[extensionDef]) ? extension[extensionDef] + ((def[extensionDef].$unit) ? ' '+def[extensionDef].$unit : '') : 'N/A'} ${(def[extensionDef].name) ? '('+def[extensionDef].name+')':''}`,
                info: `${(def[extensionDef].description) ? def[extensionDef].description : 'no description available'}<br>$datatype: <b>${def[extensionDef].$datatype}</b> $format: <b>${def[extensionDef].$format}</b> $unit: <b>${def[extensionDef].$unit}`,
                id: path + '/' + extensionDef,
                icon: (def[extensionDef].icon) ? def[extensionDef].icon : broker.icons.$datatype.values[extension[extensionDef].$datatype],
                selected: false,
                checkbox: true
              })
            }
          } else {
            path += '/'+extensionDef
            let treeChildren=tree[tree.push({ 
              label: `${extensionDef}`,
              info: `${(def[extensionDef].description) ? def[extensionDef].description : 'no description available'}`,
              id: path,
              icon: "fa fa-plug",
              selected: false,
              checkbox: true,
              children: []
            })-1].children;
            addDefTree(def[extensionDef],extension[extensionDef],treeChildren,path);
          }
        } else if (extensionDef==='*') {
          Object.keys(extension).forEach(extraParameter => {
            if (!def.hasOwnProperty(extraParameter)) {
              if (!extraParameter.startsWith('_')) {
                tree.push({
                  label: `${extraParameter}=${extension[extraParameter]}`,
                  info: `${(def['*'].description) ? def['*'].description : 'no description available'}`,
                  id: path + '/' + extraParameter,
                  icon: (def['*'].icon) ? def['*'].icon : 'fa fa-plug',
                  selected: false,
                  checkbox: true
                })
              }
            }
          });
        }
      })
    }

    Object.keys(broker.homieData).forEach(baseId => {
      if (config.filterTree && (config.baseId!=='[any]' && baseId !== config.baseId)) return;
      path = baseId;
      let devices = broker.homieData[baseId];
      let treeDevices=treeList[treeList.push({
        label: baseId,
        sublabel: 'base',
        class: 'homie-base',
        info: `Homie base containing devices<br><a href="https://homieiot.github.io/specification/#base-topic" target="_blank">detailed info on github</a>`,
        id: path,
        icon: "",
        selected: (config.filterTree) ? undefined : false,
        deferBuild: true,
        checkbox: (config.filterTree) ? false : true,
        expanded: (config.filterTree) ? true : undefined,
        children: []
      })-1].children;
      Object.keys(devices).forEach(deviceId => {
        if (config.filterTree && (config.deviceId!=='[any]' && deviceId !== config.deviceId)) return;
        let devicePath = path + '/'+deviceId;
        let device = devices[deviceId];
        let def = broker.getHomieConvention(device)._nodes._properties;
        let treeNodes=treeDevices[treeDevices.push({
          label: `${device.$name} (id: ${deviceId} homie ${device.$homie}) [${device.$state}]`,
          sublabel: 'device',
          class: `homie-${device.$state}`,
          info: `Homie device containing nodes and additional device data including extensions if available<br>Implementation: <b>${device.$implementation}</b><br><a href="https://homieiot.github.io/specification/#devices" target="_blank">detailed info https://homieiot.github.io/</a>`,
          id: devicePath,
          icon: (device._validated) ? "fa fa-cogs" : "fa fa-exclamation-triangle",
          selected: (config.filterTree) ? undefined : false,
          checkbox: (config.filterTree) ? false : true,
          expanded: (config.filterTree) ? true : undefined,
          deferBuild: true,
          children: []
        })-1].children;
        if (device.$extensions) {
          let extensionsArray = device.$extensions.split(',');
          extensionsArray.forEach(extensionId => {
            if (config.filterTree && (config.extensionId==='[none]' || (config.extensionId!=='[any]' && extensionId !== config.extensionId))) return;
            let extensionName = extensionId.split(':').shift();
            let extensionPath = devicePath; //  + '/' + extensionName;
            let treeParameters=treeNodes[treeNodes.push({
              label: extensionId,
              sublabel: 'extension',
              class: 'homie-extension',
              info: `${broker.homieExtensions[extensionName].description}<br>Version: <b>${broker.homieExtensions[extensionName].version}</b> Suitable for Homie <b>${broker.homieExtensions[extensionName].homie}</b><br><a href="${broker.homieExtensions[extensionName].url}" target="_blank">detailed info on github</a>`,
              id: extensionPath,
              icon: "fa fa-plug",
              selected: (config.filterTree) ? undefined : false,
              checkbox: (config.filterTree) ? false : true,
              expanded: (config.filterTree) ? true : undefined,
              deferBuild: true,
              children: []
            })-1].children;
            addDefTree(broker.homieExtensions[extensionName]._definition,device,treeParameters,extensionPath);
          });
        }
        if (device.$nodes) {
          let nodesArray = device.$nodes.split(',');
          nodesArray.forEach(nodeId => {
            if (config.filterTree && (config.nodeId!=='[any]' && nodeId !== config.nodeId)) return;
            let nodePath = devicePath + '/' + nodeId;
            let node = device[nodeId]
            if (node) {
              let treeParameters=treeNodes[treeNodes.push({
                label: `${node.$name} (id: ${nodeId}${(node.$type)? ' '+node.$type : ''})`,
                sublabel: 'node',
                class: 'homie-node',
                info: `Homie node containing properties<br>Type: <b>${node.$type}</b> Id: <b>${nodeId}</b><br><a href="https://homieiot.github.io/specification/#nodes" target="_blank">detailed info on github</a>`,
                id: nodePath,
                icon: (node._validated) ? "fa fa-cog" : "fa fa-exclamation-triangle",
                selected: (config.filterTree) ? undefined : false,
                checkbox: (config.filterTree) ? false : true,
                expanded: (config.filterTree) ? true : undefined,
                deferBuild: true,
                children: []
              })-1].children;
              if (node.$properties) {
                let propertyArray = node.$properties.split(',');
                propertyArray.forEach(propertyId => {
                  if (config.filterTree && (config.propertyId==='[none]' || (config.propertyId!=='[any]' && propertyId !== config.propertyId))) return;
                  let propertyPath = nodePath+'/'+propertyId;
                  let property = node[propertyId]
                  if (property) {
                    let treeParameter = treeParameters[treeParameters.push({
                      label: (property.$name || `id: ${propertyId}`) + ((property.hasOwnProperty('_property')) ? `=${property._property.payload} (${property._property.value}${property.$unit})` : ''),
                      sublabel: 'property',
                      class: 'homie-property',
                      info: `$datatype: <b>${property.$datatype}</b> $format:${property.$format}<br><a href="https://homieiot.github.io/specification/#nodes" target="_blank">detailed info on github</a>`,
                      id: propertyPath,
                      icon: (property._validated) ? broker.icons.$datatype.values[property.$datatype] : "fa fa-exclamation-triangle",
                      selected: (config.filterTree) ? undefined : false,
                      checkbox: (config.filterTree) ? false : true,
                      expanded: (config.filterTree) ? false : undefined,
                      deferBuild: true,
                      children: []
                    })-1].children;
                    Object.keys(property).forEach(propertyKey => {
                      let keyPath = propertyPath+'/'+propertyKey;
                      if (def.hasOwnProperty(propertyKey)) {
                        let faIcon = "";
                        if (broker.icons.hasOwnProperty(propertyKey)) {
                          faIcon=broker.icons[propertyKey].icon;
                          if (broker.icons[propertyKey].hasOwnProperty('values')) {
                            faIcon=broker.icons[propertyKey].values[property[propertyKey].toString()];
                          }
                        }
                        treeParameter.push({
                          label: `${propertyKey}=${property[propertyKey]}`,
                          sublabel: 'attribute',
                          class: 'homie-parameter',
                          id: keyPath,
                          icon: faIcon
                        })
                      }
                    });
                  }
                });
              }
              if (treeParameters.length===0) { // no  matches further down the path, so delete this entity again.
                treeNodes.pop();
              }
            }
          });
        }
        if (treeNodes.length===0) { // no  matches further down the path, so delete this entity again.
          treeDevices.pop();
        }
      });
      if (treeDevices.length===0) { // no  matches further down the path, so delete this entity again.
        treeList.pop();
      }
    });

    res.json(treeList);
  });

  RED.httpAdmin.get("/homieConvention/deviceList", RED.auth.needsPermission('homie-convention-device.read'), function(req,res) {
    var returnItems = []; // list of Items to send back to the frontend
    var config = req.query;
    if (typeof config.settable=="string") config.settable=(config.settable==="true"); // sometimes config.settable comes as a string
    var broker = RED.nodes.getNode(config.broker);

    var addStateToList = function (device) {
      const homieDef = {
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
        "$homie":{"icon":"fa fa-tag","type":"string","unit":"","required":true,"default":"n/a","format":""},
        "$extensions":{"icon":"fa fa-tags","type":"string","unit":"","required":false,"default":"n/a","format":""},
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
      var item = {
        class : 'palette-header',
        label : device.$name + " [" + device.$state + "]",
        icon :  homieDef.$state.format[device.$state],
        children : []
      }
      for (var element in device) {
        if (homieDef.hasOwnProperty(element)) {
          if (homieDef[element] && homieDef[element].hasOwnProperty("icon")) {
            item.children.push({"label": element +" = "+ (device[element] || "n/a")+" "+homieDef[element].unit, "icon": homieDef[element].icon});
          } else {
            if (typeof device[element] === "object") {
              for (var subElement in device[element]) {
                if (homieDef[element][subElement] && homieDef[element][subElement].hasOwnProperty("icon")) {
                  item.children.push({"label": subElement +" = "+ (device[element][subElement].value || "n/a")+" "+homieDef[element][subElement].unit, "icon": homieDef[element][subElement].icon});
                } else {
                  // RED.log.error("[homie stats list] child "+subElement+" not defined");
                }
              }
            } else {
              RED.log.error("[homie stats list] "+element+" not defined");
            }
          }
        }
      }
      returnItems.push(item);
    }

    // just to support legacy
    if (config.baseID===undefined || (!broker.homieData.hasOwnProperty(config.baseID) && config.baseID!=='[any]')) {
      config.baseID='[any]';
    }
    
    var bases = [];
    var devices = [];
    var nodes = [];

    switch (config.itemID) {
      case 'baseID':
        returnItems = Object.keys(broker.homieData);
        break;
      case 'deviceID':
        bases = (config.baseID==="[any]") ? Object.keys(broker.homieData) : [config.baseID];
        bases.forEach(base => {
          returnItems = returnItems.concat(Object.keys(broker.homieData[base]))
        });
        break;
      case 'nodeID':
        bases = (config.baseID==="[any]") ? Object.keys(broker.homieData) : [config.baseID];
        bases.forEach(base => {
          devices = (config.deviceID==="[any]") ? Object.keys((broker.homieData[base]) ? broker.homieData[base] : {}) : [config.deviceID];
          devices.forEach(device => {
            if (broker.homieData[base].hasOwnProperty(device)) {
              returnItems= returnItems.concat((broker.homieData[base][device].$nodes) ? broker.homieData[base][device].$nodes.split(',') : []);
            }
          });
        });
        break;
      case 'propertyID':
        bases = (config.baseID==="[any]") ? Object.keys(broker.homieData) : [config.baseID];
        bases.forEach(base => {
          devices = (config.deviceID==="[any]") ? Object.keys((broker.homieData[base]) ? broker.homieData[base] : {}) : [config.deviceID];
          devices.forEach(device => {
            nodes = (config.nodeID==="[any]") ? Object.keys((broker.homieData[base][device]) ? broker.homieData[base][device] : {}) : [config.nodeID];
            nodes.forEach(node => {
              if (broker.homieData[base].hasOwnProperty(device) && broker.homieData[base][device].hasOwnProperty(node)) {
                returnItems= returnItems.concat((broker.homieData[base][device][node].$properties) ? broker.homieData[base][device][node].$properties.split(',') : []);
              }
            });
          });
        });
        break;
      case 'extensionID':
        bases = (config.baseID==="[any]") ? Object.keys(broker.homieData) : [config.baseID];
        bases.forEach(base => {
          devices = (config.deviceID==="[any]") ? Object.keys((broker.homieData[base]) ? broker.homieData[base] : {}) : [config.deviceID];
          devices.forEach(device => {
            if (broker.homieData[base][device]) {
              returnItems= returnItems.concat((broker.homieData[base][device].$extensions) ? broker.homieData[base][device].$extensions.split(',') : []);
            }
          });
        });
        break;
      case 'stateList':
        if (config.deviceID==='') config.deviceID='[any]';
        bases = (config.baseID==="[any]") ? Object.keys(broker.homieData) : [config.baseID];
        bases.forEach(base => {
          devices = (config.deviceID==="[any]") ? Object.keys((broker.homieData[base]) ? broker.homieData[base] : {}) : [config.deviceID];
          devices.forEach(device => {
            if (broker.homieData[base][device]) {
              addStateToList(broker.homieData[base][device]);
            }
          });
        });
        res.json([...new Set(returnItems)]);
        return;
    }
    // filter out duplicate names & sort
    // returnItems.filter((item, index) => returnItems.indexOf(item) === index);
    res.json([...new Set(returnItems)].sort((a,b) => {
      if ( a.toLowerCase() < b.toLowerCase() )
        return -1;
      else if ( a.toLowerCase() > b.toLowerCase() )
        return 1;
      else
        return 0;
    }));
  });

  // callback function to deliver configuration information about devices / nodes or properties
  // ToDo: Filter Information by wildcards

  RED.httpAdmin.get("/homieConvention/propertyInfo", RED.auth.needsPermission('homie-convention-device.read'), function(req,res) {
    var config = req.query;
    // node.addToLog("debug","/homieConvention/propertyInfo called for broker " + config.name + " query: "+ config.itemID+" Filter D:"+config.deviceID+" N:"+config.nodeID+" P:"+config.propertyID);
    var broker = RED.nodes.getNode(config.broker);
    var devices = {queryValueID: config.queryValueID};
    switch (config.queryValueID) {
      case 'baseID':
          devices.info = broker.broker.homieData[config.baseID] || {};
          break;
      case 'deviceID':
          devices.info = broker.broker.homieData[config.baseID][config.deviceID] || {};
          break;
      case 'nodeID':
          devices.info = broker.broker.homieData[config.baseID][config.deviceID][config.nodeID] || {};
          break;
      case 'propertyID':
          devices.info = broker.broker.homieData[config.baseID][config.deviceID][config.nodeID][config.propertyID] || {};
          break;
    }

    res.json(devices);
  });
};
