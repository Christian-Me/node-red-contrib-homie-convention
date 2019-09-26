module.exports = function (RED) {
  function homieDevice (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.handleDeviceState = function (state) {
      switch (state) {
        case 'connected':
          node.status({ fill: 'green', shape: 'dot', text: 'MQTT connected' });
          break;
        case 'disconnected':
          node.status({ fill: 'red', shape: 'ring', text: 'MQTT disconnected' });
          break;
      }
    };

    this.log = {};
    this.broker = RED.nodes.getNode(config.broker);
    this.deviceID = config.deviceID;
    this.nodeID=config.nodeID;
    this.propertyID=config.propertyID;
    this.infoError=config.infoError; // include Error messages
    this.infoAttributes=config.infoAttributes; // influde Attribute information
    this.infoTiming=config.infoTiming; // include Timing messages
    this.addLabel=config.addLabel; // include msg.label 
    this.labelTopic=config.labelTopic; // msg.topic = msg.label
    this.labelPayload=config.labelPayload; // msg.payload = msg.label
    this.uiPlaceName = config.uiPlaceName; // Placeholder Text for uiDropdown
    this.uiControlDropdown=config.uiControlDropdown; // convert $format to msg.options for uiDropdown
    this.uiNode=config.uiNode; // type of node connected to
    this.uiControl=config.uiControl; // convert $format if aplictable;
    this.uiControlMinMax=config.uiControlMinMax; // convert $format min:max to ui_control.min / max
    this.uiLabel=config.uiLabel; // label ui elements (if possible);
    this.uiColor1=config.uiColor1; // foreground color
    this.uiBgColor1=config.uiBgColor1; // background color
    this.uiColorON=config.uiColorON;
    this.uiColorOFF=config.uiColorOFF;
    this.uiColorPredicted=config.uiColorPredicted;
    this.uiUseColorPredicted=config.uiUseColorPredicted;
    this.uiColorPredictedOff=config.uiColorPredictedOff;
    this.uiUseColorPredictedOff=config.uiUseColorPredictedOff;
    this.uiFormat=config.uiFormat;
    this.uiTooltip=config.uiTooltip; // tooltip
    this.uiIcon1=config.uiIcon1; // icon 
    this.uiIconON=config.uiIconON; // icon 
    this.uiIconOFF=config.uiIconOFF; // icon 
    this.labelName=config.labelName; // custom label;
    this.uiSwitchPredicted=config.uiSwitchPredicted; // use predicted states for switches
    this.uiSwitchColorPredictedON=config.uiSwitchColorPredictedON;
    this.uiSwitchColorPredictedOFF=config.uiSwitchColorPredictedOFF;
    this.uiSwitchIconPredictedON=config.uiSwitchIconPredictedON;
    this.uiSwitchIconPredictedOFF=config.uiSwitchIconPredictedOFF;

    if ((typeof config.settable)=="string")  this.settable=(config.settable=="true");
     else this.settable=config.settable; // configure node as settable
    if (this.settable) this.inputs = 1;
      else this.inputs = 0;
    // this.homieDevice=this.broker.homieData[this.deviceID] || {};
    // this.homieNode=this.broker.homieData[this.deviceID][this.nodeID] || {};
    // this.homieProperty=this.broker.homieData[this.deviceID][this.nodeID][this.propertyID] || {};

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
        RED.log[type]("contrib-homie-convention homie.device: "+node.log[type]);
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
    // add ui controll attributes
    // ------------------------------------------
    
    this.addUiControl = function (msgOut) {
      property=node.broker.homieData[msgOut.device][msgOut.node][msgOut.property];
      if (property===undefined) {
        msgOut.error={"status":"error"};
        msgOut.error.errorText="addUIConmtrol: property not found!";
        return false;
      };
      switch(node.uiNode) {
        case 'uiText':
            if (node.uiFormat) {
              if (property.$unit) {
                if (!msgOut.ui_control) msgOut.ui_control={};
                msgOut.ui_control.format="{{msg.payload}} "+property.$unit;
              } else {
                msgOut.error={"status":"warning"};
                msgOut.error.errorText="addUIConmtrol:uiText Property " + property.$name + " has no $unit defined!";
              }
            }
            break;
        case 'uiNumeric':
            if (node.uiFormat) {
              if (property.$unit) {
                if (!msgOut.ui_control) msgOut.ui_control={};
                msgOut.ui_control.format="{{msg.value}} "+property.$unit;
              } else {
                msgOut.error={"status":"warning"};
                msgOut.error.errorText="addUIConmtrol:uiSlider/uiNumeric Property " + property.$name + " has no $unit defined!";
              }
            }
            // no break because uiNumeric can use min:max too
        case 'uiSlider':
                if (node.uiControlMinMax) {
                  if (property.$format) {
                    var formatValues = property.$format.split(':');
                    if (formatValues.length==2) {
                      msgOut.ui_control={};
                      msgOut.ui_control.min=Number(formatValues[0]);
                      msgOut.ui_control.max=Number(formatValues[1]);
                    } else {
                      msgOut.error={"status":"warning"};
                      msgOut.error.errorText="addUIConmtrol:uiSlider Property " + property.$name + " has no proper $format defined ("+property.$format+")";
                    }
                  } else {
                    msgOut.error={"status":"warning"};
                    msgOut.error.errorText="addUIConmtrol:uiSlider Property " + property.$name + " has no $format defined!";
                  }
                }
                break;
        case 'uiDropdown':
                  msgOut.ui_control={"options":[]};
                  msgOut.ui_control.place = node.uiPlaceName;
                  msgOut.ui_control.label = msgOut.label;
                  if(property.$datatype=='enum') { // include options for drop down UI elemnts using ui_control parameters for ui_dropdown
                    property.$format.split(",").forEach(function(element){
                      msgOut.ui_control.options.push({"label":element, "value": element, "type":"str"});
                    });
                  }
                  break;
        case 'uiButton':
                  msgOut.ui_control={"color":node.uiColor1};
                  msgOut.ui_control.bgcolor=node.uiBgColor1;
                  msgOut.ui_control.icon=node.uiIcon1;
                  msgOut.ui_control.tooltip=node.uiTooltip;
                  break;
        case 'uiButtonSwitch':
                  msgOut.ui_control={"color":node.uiColor1};
                  msgOut.ui_control.bgcolor=node.uiBgColor1;
                  if (msgOut.payload && property.$datatype && property.$format) {
                    switch(property.$datatype){
                      case 'enum':
                        var enumValues = property.$format.split(',');
                        if (msgOut.payload==enumValues[0]) { // OFF state
                          if (msgOut.predicted && node.uiUseColorPredictedOff) msgOut.ui_control.bgcolor=node.uiColorPredictedOff;
                            else msgOut.ui_control.bgcolor=node.uiColorOFF;
                        } else if (msgOut.payload==enumValues[1]) { // ON state
                          if (msgOut.predicted && node.uiUseColorPredicted) msgOut.ui_control.bgcolor=node.uiColorPredicted;
                            else msgOut.ui_control.bgcolor=node.uiColorON;
                        } else { // error
                          msgOut.error={'status':'error'};
                          msgOut.error.errorText="uiButtonSwitch for enum property "+msgOut.topic+". $format="+property.$format+". msg.payload="+msgOut.payload+" does not match first two opitions! No output";
                          node.send([null,msgOut.error]);
                        }
                        break;
                      case 'booleam':
                        break;
                    }
                  }
                  msgOut.ui_control.icon=node.uiIcon1;               
                  msgOut.ui_control.tooltip=node.uiTooltip;
                  break;
        case 'uiSwitch':
                  msgOut.ui_control={'tooltip':node.uiTooltip};
                  if (typeof msgOut.payload != "boolean") {
                    msgOut.payload = (msgOut.value==0) ? msgOut.payload=false : msgOut.payload=true;
                  }
                  if (node.uiIconON.length>0 || node.uiIconOFF.length>0) {
                    msgOut.ui_control.oncolor=node.uiColorON;
                    msgOut.ui_control.offcolor=node.uiColorOFF;
                    msgOut.ui_control.onicon=node.uiIconON;
                    msgOut.ui_control.officon=node.uiIconOFF;
                  }
                  if (node.uiSwitchPredicted) {
                    if (msgOut.predicted) { // enter predicted state
                      msgOut.ui_control.oncolor=node.uiSwitchColorPredictedON;
                      msgOut.ui_control.offcolor=node.uiSwitchColorPredictedOFF;
                      msgOut.ui_control.onicon=node.uiSwitchIconPredictedON;
                      msgOut.ui_control.officon=node.uiSwitchIconPredictedOFF;
                    } else { // exit predicted state
                      msgOut.ui_control.oncolor="";
                      msgOut.ui_control.offcolor="";
                      msgOut.ui_control.onicon="";
                      msgOut.ui_control.officon="";
                    }
                  } 
                break;
      }
    };

    // ------------------------------------------
    // send startup messages
    // ------------------------------------------

    this.startupMessages = function (validatedDevice,validatedNode,validatedProperty) {
      
      var sendProperty = function (currentDevice,currentNode,currentProperty) {
        if (node.uiNode=="none" && node.addLabel=="none") return false; // no startup messages nessesary
        var msgOut = {};
        var homieDevice= node.broker.homieData[currentDevice];
        if (!homieDevice) {
          node.addToLog("error","startupMessages:sendProperty:"+currentDevice+"/"+currentNode+"/"+currentProperty+" failed!");
          return false;
        }
        if (homieDevice[currentNode]!==undefined) {
          var homieNode=homieDevice[currentNode];
          if (homieNode[currentProperty]!==undefined) {
            var homieProperty=homieNode[currentProperty];
            if (homieProperty.$datatype!==undefined) {
              node.addToLog("info","startupMessages:sendProperty:"+currentDevice+"/"+currentNode+"/"+currentProperty);
 
              // prepare startup message
              msgOut={device: currentDevice, node: currentNode, property: currentProperty}
              node.prepareMsgOut(msgOut);

              // add ui controlls
              if (node.uiNode!="none") node.addUiControl(msgOut);

              if (homieProperty.payload) msgOut.payload = homieProperty.payload;
              if (homieProperty.value) msgOut.value = homieProperty.value;

              // prepare Label
              if (node.addLabel=="name") msgOut.label= homieProperty.$name;
              if (node.labelPayload) msgOut.payload=msgOut.label;
              
              // send startup message;
              if (msgOut.error) node.send([null,msgOut]);
              else node.send([msgOut,null]);
              node.sendLogs();
            }
          }
        }
      }

      var sendNode = function (currentDevice,currentNode,currentProperty) {
        var homieDevice= node.broker.homieData[currentDevice];
        if (homieDevice!==undefined) {
          //console.log(" sendNode:", currentDevice, "/", currentNode, "/", currentProperty);
          var homieNode=homieDevice[currentNode];
          if (currentProperty=='[any]') { // check all properties if startup messages to be send
            for (var propertyName in homieNode) {
              sendProperty(currentDevice,currentNode,propertyName);
            } // single property
          } else sendProperty(currentDevice,currentNode,currentProperty);
        }      
      }

      var sendDevice = function (currentDevice,currentNode,currentProperty) {
        var homieDevice= node.broker.homieData[currentDevice];
        if (homieDevice!==undefined && homieDevice.itemList!==undefined) {
          //console.log(" sendDevice:", currentDevice, "/", currentNode, "/", currentProperty);
          if (currentNode=='[any]') { // check all nodes if they contain proerties with startup messages to be send
            for (var nodeName in homieDevice.itemList) {
              sendNode(currentDevice,nodeName,currentProperty);
            } // single Node
          } else sendNode(currentDevice,currentNode,currentProperty);
        }      
      }

      if (node.broker===undefined || node.broker.homieData===undefined || node.broker.homieData[validatedDevice]===undefined) { //|| node.broker.homieData[validatedDevice].itemList===undefined
        node.addToLog("error","startupMessages(node) homieData not found. "+validatedDevice);
      } else {
        if (validatedProperty) { // send for single property
          sendProperty(validatedDevice,validatedNode,validatedProperty);
        } else if (node.deviceID=='[any]') { // loop through devices
          for (var deviceName in node.broker.homieData) { // check if any device matches the desired device name
           if (validatedDevice==deviceName) sendDevice(node.deviceID,node.nodeID,node.propertyID);
          }
        } else { // single Device
          if (validatedDevice==node.deviceID) sendDevice(node.deviceID,node.nodeID,node.propertyID);
        }
      }
      node.sendLogs();
    };

    this.broker.on('validatedDevice', function (deviceName, nodeId, propertyId, msgOut) {
      // node.startupMessages(node,deviceName); 
    });

    this.broker.on('validatedProperty', function (deviceId, nodeId, propertyId, msgOut) {
      if ((node.deviceID=="[any]" || node.deviceID==deviceId) &&
          (node.nodeID=="[any]" || node.nodeID==nodeId) &&
          (node.propertyID=="[any]" || propertyId==node.propertyID)) {
        node.startupMessages(deviceId,nodeId,propertyId);
      }
    });

    this.on('input', function(msg) {
      var msgError = {status: "error"};
      msgError.function = "input"
      var msgOut = {};

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
                    case ('string'):
                      msgOut.payload=msg.payload;
                      break;
                    case ('boolean'): // accept true/false, 0/1, "ON"/"OFF", "on"/"off", "true"/"false";
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
                        default:
                          if (!(msg.payload==false || msg.payload==0 || msg.payload=='false' || msg.payload=='on' || msg.payload=='ON')) { // no matches at all
                            msgError.error = "payload "+msg.payload+" could not converted to $datatype=boolean. No output";
                            node.send([null,msgError]);
                            return;            
                          }
                      }
                      break;
                    case ('enum'): // $datatype='enum' $format needs to contain comma seperated list.
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
                        if (property.$format.includes(msg.payload)) { // msg.payload exists in $format! Change state accordingly
                          if (msg.payload==enumValues[0] || msg.payload==enumValues[1]) {
                            property.payload=msg.payload;
                            if (msg.payload==enumValues[0]) property.value=0;
                            else property.value=1;
                          }
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
                      if (property.$format!==undefined) {
                        if (typeof msg.payload == "object") {
                          if (msg.payload.h && msg.payload.s && msg.payload.v) {
                            if (property.$format=='hsv') {
                              msgOut.payload=msg.payload.h+","+(Math.floor(msg.payload.s*100))+","+(Math.floor(msg.payload.v*100));
                            } else {
                              msgError.error = "payload is formated as hsv object but $format="+property.$format+". No output";
                              node.send([null,msgError]);
                              return;
                            }
                          }
                          if (msg.payload.r && msg.payload.g && msg.payload.b) {
                            if (property.$format=='rgb') {
                              msgOut.payload=msg.payload.r+","+msg.payload.g+","+msg.payload.b;
                            } else {
                              msgError.error = "payload is formated as rgb object but $format="+property.$format+". No output";
                              node.send([null,msgError]);
                              return;
                            }
                          }
                        } else {
                          var colors = msg.payload.split(',');
                          if (colors.length==3) {
                            if (colors[0].includes('(')) colors[0]=colors[0].substring(colors[0].search('(')+1);
                            if (colors[2].includes(')')) colors[0]=colors[0].substring(0,colors[0].search('('));
                            switch (property.$format) {
                              case('rgb'):
                                for (var i=0; i<3; i++) {
                                  if (Number(colors[i])<0) colors[i]=0;
                                  else if (Number(colors[i])>255) colors[i]=255;
                                  else colors[i]=Number(colors[i]);
                                }
                                break;
                              case('hsv'):
                                if (Number(colors[0])<0) colors[0]=0;
                                else if (Number(colors[0])>360) colors[0]=360;
                                else colors[i]=Number(colors[i]);
                                for (var i=1; i<3; i++) {
                                  if (Number(colors[i])<0) colors[i]=0;
                                  else if (Number(colors[i])>100) colors[i]=100;
                                  else colors[i]=Number(colors[i]);
                                }
                                break;
                              default:
                                msgError.error = "payload "+msg.payload+" could not sent as color because $format="+property.$format+" is not defined as rgb or hsv. Sending anyway.";
                                node.send([null,msgError]);        
                            }
                            msgOut.payload=colors[0]+','+colors[1]+','+colors[2];
                          } else {
                            msgError.error = "Not proper formated payload "+msg.payload+". It has not 3 components r,g,b or h,s,v. No output";
                            node.send([null,msgError]);
                            return;                                   
                          }
                        }
                      } else {
                        msgError.error = "payload "+msg.payload+" could not converted to $datatype=color because $format not defined (colorspace unknown). No output";
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
              msgError.error = "Property "+msgOut.property+" of Node "+msgOut.node+" not has no $settable attribute. No output"
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

        // save new value as predicted in homieData
        property.value=msgOut.payload; // finally we shoud have a matching value to send.
        property.predicted=true; // mark value as predicted;
        msgOut.predicted=property.predicted;

        node.broker.sendToDevice(msgOut.device,msgOut.node,msgOut.property,msgOut.payload); // FIRST send unaltered data to mqtt broker!
        node.addUiControl(msgOut); //add ui controll attributes to msgOut
        node.send([msgOut,null]);
        return;
      }

      var sendByDevice = function (device) {
        if(msgOut.node=="[any]") { // include [any] node. loop through nodes
          for (var i=0; i<device.itemList.length; i++) {
            homieNode=device.itemList[i];
            sendToProperty(homieNode);
          }
        } else {
          homieNode = device[msgOut.node];
          sendToProperty(homieNode);
        } 
        return;
      }
      
      node.addToLog("debug","Message arrived! topic="+msg.topic+" payload="+msg.payload);
      if (msg.topic!==undefined) { // topic specified = try to use this
        var splitted = msg.topic.split('/');
        if (splitted.length!=3) {
          msgError.error = "Expected deviceID/nodeID/propertyID as topic. Received: "+msg.topic+". No output"
          node.send([null,msgError]);
          return;
        }
        msgOut.device = splitted[0];
        msgOut.node = splitted[1];
        msgOut.property = splitted[2];
      } else { // no topic specified = use node settings
        msgOut.device = node.deviceID;
        msgOut.node = node.nodeID;
        msgOut.property = node.propertyID;
      }
      node.prepareMsgOut(msgOut);
      if (msgOut.property == '[any]') {
        msgError.error = "Wildcards are not allowed for /set properties! Received: "+msg.topic+". No output"
        node.send([null,msgError]);
        return;
      }
      if (msgOut.device=="[any]") { // Include [any] device. loop through devices
        for (var deviceName in node.broker.homieData) {
          device=node.broker.homieData[deviceName];
          sendByDevice(device);
        }
      } else {
        device = node.broker.homieData[msgOut.device];
        if (device!==undefined) {
          sendByDevice(device);
        } else {
          msgError.error = "Device "+msgOut.device+" not found. No output"
          node.send([null,msgError]);
          return;  
        }
      }

    });

    // fill output message with common values
    this.prepareMsgOut = function(msgOut) {
      // console.log("prepareMsgOut:",msgOut);
      switch (node.addLabel) {
        case 'custom':  
          msgOut.label = node.labelName;
          //msgOut.alabel = node.labelName;
          break;
        case 'device': msgOut.label = msgOut.device;
          break;
        case 'node': msgOut.label = msgOut.node;
          break;
        case 'property':  msgOut.label = msgOut.property;
          break;
        case 'device/node': msgOut.label = msgOut.device+"/"+msgOut.node;
          break;
        case 'device/node/property': msgOut.label = msgOut.device+"/"+msgOut.node+"/"+msgOut.property;
          break;
      }
      if (node.labelTopic) msgOut.topic=msgOut.label;
        else msgOut.topic = msgOut.device+"/"+msgOut.node+"/"+msgOut.property;
      //  console.log("prepareMsgOut done:",msgOut);
    }

    // Format output Message
    this.broker.on('message', function (deviceId, nodeId, propertyId, msgOut) {
      var log = "homie message arrived ("+node.deviceID+"/"+node.nodeID+"/"+node.propertyID+"):";
      if (msgOut===undefined) return;
      if (node.deviceID=='[any]' || node.deviceID===deviceId) {
        log += " " + node.deviceID + "=" + deviceId;
        if (node.nodeID=='[any]' || node.nodeID===nodeId) {
          log += " " + node.nodeID + "=" + nodeId;
          if (node.propertyID=='[any]' || node.propertyID==propertyId) {
            log += " " + node.propertyID + "=" + propertyId + " payload=" + msgOut.payload;
            switch(msgOut.error.status) {
              case 'error': node.status({ fill: 'red', shape: 'dot', text: msgOut.error.errorText});
                            break;
              case 'warning': node.status({ fill: 'yellow', shape: 'dot', text: msgOut.error.errorText});
                            break;
              case 'ok': if (!node.infoAttributes) {
                            node.status({ fill: 'green', shape: 'dot', text: msgOut.topic + '=' + msgOut.payload});
                          } else {
                            node.status({ fill: 'green', shape: 'dot', text: '#' + msgOut.timing.msgCounter + ' (' + Math.floor(msgOut.timing.interval/1000) + 's) '+ msgOut.topic + '=' + msgOut.payload});
                          }
                          node.addUiControl(msgOut); // only add UI controlls if there was NO error
                          break;
            }

            node.prepareMsgOut(msgOut);

            if (!node.infoTiming) delete msgOut.timing;
            if (!node.infoAttributes) delete msgOut.attributes;
            if (!node.infoError && msgOut.error.status=='ok') delete msgOut.error;
            if (msgOut.error===undefined || msgOut.error.status=='ok') node.send([msgOut,null]);
              else node.send([null,msgOut]); // send error Message only.
            node.addToLog("info",log);
          }
        }
      }
    });
  }

  RED.nodes.registerType('homie-convention-device', homieDevice);

  // callback functions

  RED.httpAdmin.get("/homieConvention/deviceList", RED.auth.needsPermission('homie-convention-device.read'), function(req,res) {
    var devices = []; // list of Items to send back to the frontend
    var config = req.query;
    if (typeof config.settable=="string") config.settable=(config.settable==="true"); // sometimes config.settable comes as a string
    var device = {}; 
    var node = {};
    var property = {};
    var propertySettable = false;
    var broker = RED.nodes.getNode(config.broker);

    var addItemToList = function (item) {
      if (config.itemID!='treeList') { // ignore dublicates exept for tree list
        for (var i=0; i<devices.length; i++) { // filter dublicate items.
          if (devices[i].$name==item.name) return;
        }
      } else { // fill tree list
        broker.validateHomie('property',device.$name,node.$name,item.name);
        // config.addToLog("debug","addItemToList treeList Property : "+property.$name);
        item.class= 'palette-header';
        item.label="";
        if (!device.validated) item.label+=device.$name+"(?)/";
          else item.label+=device.$name+"/";
        if (!node.validated) item.label+=node.$name+"(?)/";
          else item.label+=node.$name+"/";
        if (!property.validated) item.label+=property.$name+"(?)";
          else item.label+=property.$name;

        item.children=[];
        item.children.push({label: "$type :"+ (node.$type || "n/a"), icon: "fa fa-cogs"});
        item.children.push({label: "$settable : "+ (property.$settable || false), icon: "fa fa-bolt"});
        item.children.push({label: "$datatype : "+ (property.$datatype || "string"), icon: "fa fa-edit"});
        item.children.push({label: "$format : "+ (property.$format || "n/a"), icon: "fa fa-paint-brush"});
        item.children.push({label: "$unit : "+ (property.$unit || "n/a"), icon: "fa fa-thermometer-half"});
        item.children.push({label: "$name : "+ (property.$name || "n/a"), icon: "fa fa-info"});
        item.children.push({label: "message : "+ (property.message || "n/a"), icon: "fa fa-envelope"});
        item.children.push({label: "payload : "+ (property.payload || "n/a"), icon: "fa fa-envelope-open-o"});
        item.children.push({label: "value : "+ (property.value || "n/a"), icon: "fa fa-envelope-open"});
        if (!device.validated)
          item.children.push({label: "device validation : "+ (device.validationError || "n/a"), icon: "fa fa-bomb"});
        if (!node.validated)
          item.children.push({label: "node validation : "+ (node.validationError || "n/a"), icon: "fa fa-bomb"});
        if (!property.validated)
          item.children.push({label: "property validation : "+ (property.validationError || "n/a"), icon: "fa fa-bomb"});
        item.icon="";
        switch(property.$datatype) {
          case 'integer':
              item.icon+="fa fa-signal"
              break;
          case 'float':
              item.icon+="fa fa-sliders";
              break;
          case 'boolean':
              item.icon+="fa fa-toggle-on";
              break;
          case 'string':
              item.icon+="fa fa-text";
              break;
          case 'enum':
              item.icon+="fa fa-list-ol";
              break;
          case 'color':
              item.icon="fa fa-palette";
              break;
        }
        item.children[2].icon = item.icon;
        if (property.$settable) item.icon="fa fa-bolt ";
        if (!device.validated) item.icon="fa fa-bomb";
      }
      devices.push(item);
    }

    var addPropertyToList = function (item) {
      property=node[item.name];
      if (property.$settable===undefined) propertySettable = false;
        else propertySettable=property.$settable;
      if (typeof config.settable=="string") config.settable=(config.settable==="true");
      // config.addToLog("debug","addPropertyToList : "+config.settable+"("+typeof config.settable+") : "+propertySettable+" : "+item.name);
      if (config.itemID!='treeList') { // ignore dublicates exept for tree list
        for (var i=0; i<devices.length; i++) { // filter dublicate items.
          if (devices[i].name==item.name) return;
        }
        if (config.settable==false) addItemToList(item); // $settable filter not set
          else if (propertySettable) addItemToList(item); // match properties with $settable flag set 
      } else { // for treeList filter selected property
        if (config.propertyID=='[any]' || config.propertyID==item.name) { // [any] property or property name matches
          if (config.settable==false) addItemToList(item); // $settable filter not set
            else if (propertySettable) addItemToList(item); // match properties with $settable flag set 
        }
      }
    }
    
     var addNodeToList = function (item) {

      // config.addToLog("debug","addNodeToList : "+config.$settable+" : "+item.$settable+" : "+item.name);
      node = device[item.name];
      if (node!==undefined) node.itemList.forEach(addPropertyToList);
    }

    // config.addToLog("debug","/homieConvention/deviceList called for broker " + config.name + " query: "+ config.itemID+" Filter D:"+config.deviceID+" N:"+config.nodeID+" P:"+config.propertyID+" S:"+config.settable);
    var errorStr = "";
    switch (config.itemID) {
      case 'deviceID':    devices = broker.homieDevices || [];
                          break;
      case 'nodeID':      if (config.deviceID!="[any]") { // nodes from a specific device
                            if (broker.homieData[config.deviceID]!==undefined) {
                              devices = broker.homieData[config.deviceID].itemList || [];
                            }
                          } else { // nodes from any Device
                              for (var deviceName in broker.homieData) {
                                device=broker.homieData[deviceName];
                                if (device.itemList!==undefined) {
                                  device.itemList.forEach(addItemToList);
                                }
                              }
                          }
                          break;
      case 'propertyID':
      case 'treeList': 
                          // node.addToLog("debug","deviceList : "+config.deviceID+"/"+config.nodeID+"/"+config.propertyID+" Settable:"+config.settable);

                          if (config.deviceID!="[any]" && config.nodeID!="[any]") { // property from a specific device and node
                            device = broker.homieData[config.deviceID];
                            node = broker.homieData[config.deviceID][config.nodeID];
                            if (device!==undefined && node!==undefined) {
                              node.itemList.forEach(addPropertyToList);
                            }
                          } else {
                            if (config.deviceID=="[any]") { // Include [any] device. loop through devices
                              for (var deviceName in broker.homieData) {
                                device=broker.homieData[deviceName];
                                if (device.itemList!==undefined) {
                                  if (config.nodeID=="[any]") { // loop through nodes
                                    device.itemList.forEach(addNodeToList);
                                  } else { // specific node defined
                                    node = device[config.nodeID];
                                    if (node!==undefined) {
                                     if (node.itemList!==undefined) node.itemList.forEach(addPropertyToList);
                                    }
                                  }
                                } 
                              }
                            } else { // specific device defined
                              device = broker.homieData[config.deviceID];
                              if (device.itemList!==undefined) {
                                if (config.nodeID=="[any]") { // loop through nodes
                                  device.itemList.forEach(addNodeToList);
                                } else { // specific node defined
                                  if (device[config.nodeID]!==undefined) {
                                    node = device[config.nodeID];
                                    node.itemList.forEach(addPropertyToList);
                                  } 
                                }
                              }
                            }
                          }
                          break;

    }
    res.json(devices);
  });

  // callback function to deliver configuration information about devices / nodes or properties
  // ToDo: Filter Information by wildcards

  RED.httpAdmin.get("/homieConvention/propertyInfo", RED.auth.needsPermission('homie-convention-device.read'), function(req,res) {
    var config = req.query;
    // node.addToLog("debug","/homieConvention/propertyInfo called for broker " + config.name + " query: "+ config.itemID+" Filter D:"+config.deviceID+" N:"+config.nodeID+" P:"+config.propertyID);
    var broker = RED.nodes.getNode(config.broker);
    var devices = {queryVaueID: config.queryValueID};
    switch (config.queryValueID) {
      case 'deviceID':
          devices.info = broker.broker.homieData[config.deviceID] || {};
          break;
      case 'nodeID':
          devices.info = broker.broker.homieData[config.deviceID][config.nodeID] || {};
          break;
      case 'propertyID':
          devices.info = broker.broker.homieData[config.deviceID][config.nodeID][config.propertyID] || {};
          break;
    }

    res.json(devices);
  });
};
