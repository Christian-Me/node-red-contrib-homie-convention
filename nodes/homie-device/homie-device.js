module.exports = function (RED) {
  function homieDevice (config) {
    RED.nodes.createNode(this, config);
    var node = this;
    this.startupSent = false; // flag if startup messages are sent
    
    this.handleDeviceState = function (state) {
      switch (state) {
        case 'connected':
          node.status({ fill: 'green', shape: 'dot', text: 'MQTT connected' });
          break;
        case 'disconnected':
          node.status({ fill: 'red', shape: 'ring', text: 'MQTT disconnected' });
          node.startupSent = false;
          break;
      }
    };

    this.log = {};
    this.broker = RED.nodes.getNode(config.broker);
    this.deviceID = config.deviceID;
    this.nodeID=config.nodeID;
    this.propertyID=config.propertyID;
    this.infoError=config.infoError; // include Error messages
    this.infoAttributes=config.infoAttributes; // include Attribute information
    this.infoTiming=config.infoTiming; // include Timing messages
    this.addLabel=config.addLabel; // include msg.label 
    this.labelTopic=config.labelTopic; // msg.topic = msg.label
    this.labelPayload=config.labelPayload; // msg.payload = msg.label
    this.uiPlaceName = config.uiPlaceName; // Placeholder Text for uiDropdown
    this.uiControlDropdown=config.uiControlDropdown; // convert $format to msg.options for uiDropdown
    this.uiNode=config.uiNode; // type of node connected to
    this.uiControl=config.uiControl; // convert $format if applicable;
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
    this.uiFormatColor=config.uiFormatColor;

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
    // add ui control attributes
    // ------------------------------------------
    
    this.addUiControl = function (msgOut) {
      var errorMsg='';
      property=node.broker.homieData[msgOut.deviceId][msgOut.nodeId][msgOut.propertyId];
      if (property===undefined) {
        msgOut.error={"status":"error"};
        msgOut.error.errorText="addUIControl: property not found!";
        return false;
      };
      switch(node.uiNode) {
        case 'uiColor':
            errorMsg= node.formatColor(property,msgOut.payload,msgOut);
            if (errorMsg!='') {
              msgOut.error={"status":"error"};
              msgOut.error.errorText="Color formatting failed (" + errorMsg + ")";
            }
            break;
        case 'uiText':
            if (node.uiFormat) {
              if (property.$unit) {
                if (!msgOut.ui_control) msgOut.ui_control={};
                msgOut.ui_control.format="{{msg.payload}} "+property.$unit;
              } else {
                msgOut.error={"status":"warning"};
                msgOut.error.errorText="addUIControl:uiText Property " + property.$name + " has no $unit defined!";
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
                msgOut.error.errorText="addUIControl:uiSlider/uiNumeric Property " + property.$name + " has no $unit defined!";
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
                      msgOut.error.errorText="addUIControl:uiSlider Property " + property.$name + " has no proper $format defined ("+property.$format+")";
                    }
                  } else {
                    msgOut.error={"status":"warning"};
                    msgOut.error.errorText="addUIControl:uiSlider Property " + property.$name + " has no $format defined!";
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
                  if (msgOut.hasOwnProperty("payload") && property.hasOwnProperty("$datatype") && property.hasOwnProperty("$format")) {
                    switch(property.$datatype){
                      case 'boolean':
                      case 'enum':
                        var enumValues = property.$format.split(',');
                        if ((typeof msgOut.payload=="boolean" && !msgOut.payload) || msgOut.payload==enumValues[0]) { // OFF state
                          if (msgOut.predicted && node.uiUseColorPredictedOff) msgOut.ui_control.bgcolor=node.uiColorPredictedOff;
                            else msgOut.ui_control.bgcolor=node.uiColorOFF;
                        } else if ((typeof msgOut.payload=="boolean" && msgOut.payload) || msgOut.payload==enumValues[1]) { // ON state
                          if (msgOut.predicted && node.uiUseColorPredicted) msgOut.ui_control.bgcolor=node.uiColorPredicted;
                            else msgOut.ui_control.bgcolor=node.uiColorON;
                        } else { // error
                          msgOut.error={'status':'error'};
                          msgOut.error.errorText="uiButtonSwitch for enum property "+msgOut.topic+". $format="+property.$format+". msg.payload="+msgOut.payload+" does not match first two opitions! No output";
                          node.send([null,msgOut.error]);
                        }
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
        if (node.uiNode=="none" && node.addLabel=="none") return false; // no startup messages necessary
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
              msgOut={"msgType":"startup",
                      "deviceId": currentDevice, 
                      "nodeId": currentNode,
                      "propertyId": currentProperty,
                      "deviceName": homieDevice.$name,
                      "nodeName": homieNode.$name,
                      "propertyName": homieProperty.$name};
              if (!msgOut.deviceName ||
                  !msgOut.nodeName ||
                  !msgOut.propertyName) return;        
              node.prepareMsgOut(msgOut);

              // add ui controls
              if (node.uiNode!="none") node.addUiControl(msgOut);

              if (homieProperty.payload) msgOut.payload = homieProperty.payload;
              if (homieProperty.value) msgOut.value = homieProperty.value;

              // prepare Label
              if (node.addLabel=="name") msgOut.label= homieProperty.$name;
              if (node.labelPayload) msgOut.payload=msgOut.label;
              if (node.labelTopic) msgOut.topic=msgOut.label;
              
              node.sendLogs();

              // send startup message;
              if (msgOut.error) node.send([null,msgOut]);
              else node.send([msgOut,null]);
              node.startupSent= true;
            }
          }
        }
      }

      var sendNode = function (currentDevice,currentNode,currentProperty) {
        var homieDevice= node.broker.homieData[currentDevice];
        if (homieDevice!==undefined) {
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
          if (currentNode=='[any]') { // check all nodes if they contain properties with startup messages to be send
            for (var nodeName in homieDevice.itemList) {
              sendNode(currentDevice,homieDevice.itemList[nodeName].value,currentProperty);
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
          for (var deviceName in node.broker.homieData) { // send to first match
           if (validatedDevice==deviceName) {
             sendDevice(deviceName,node.nodeID,node.propertyID);
             break;
           }
          }
        } else { // single Device
          if (validatedDevice==node.deviceID) sendDevice(node.deviceID,node.nodeID,node.propertyID);
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

    this.on('input', function(msg) {
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
        property.value=msgOut.payload; // finally we should have a matching value to send.
        property.predicted=true; // mark value as predicted;
        msgOut.predicted=property.predicted;

        // FIRST send unaltered data to mqtt broker!
        if (msgOut.homiePayload) node.broker.sendToDevice(msgOut.device,msgOut.node,msgOut.property,msgOut.homiePayload); // If a special homie payload exists send this one.
        else  node.broker.sendToDevice(msgOut.device,msgOut.node,msgOut.property,(setFlag) ? (msgOut.payload+"/set") : msgOut.payload);
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
      if (msg.topic && msg.topic!=="") { // topic specified = try to use this
        splitted = msg.topic.split('/');
        setFlag = (splitted[splitted.length-1]=="set");
        if (setFlag) {
          splitted.pop();
        }
        switch (splitted.length) {
          case 1: 
            msgOut.device = node.deviceID;
            msgOut.node = node.nodeID;
            msgOut.property = splitted[0];
            break;
          case 2: 
            msgOut.device = node.deviceID;
            msgOut.node = splitted[0];
            msgOut.property = splitted[1];
            break;
          case 3:
            msgOut.device = splitted[0];
            msgOut.node = splitted[1];
            msgOut.property = splitted[2];
            break;
        }
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
      msgOut.label = msgOut.deviceName;
      switch (node.addLabel) {
        case 'custom':  
          msgOut.label = node.labelName;
          break;
        case 'device': msgOut.label = msgOut.deviceName;
          break;
        case 'node': msgOut.label = msgOut.nodeName;
          break;
        case 'property':  msgOut.label = msgOut.propertyName;
          break;
        case 'device/node': msgOut.label = msgOut.deviceName+"/"+msgOut.nodeName;
          break;
        case 'device/node/property': msgOut.label = msgOut.deviceName+"/"+msgOut.nodeName+"/"+msgOut.propertyName;
          break;
      }
      if (node.labelTopic) msgOut.topic=msgOut.label;
        else msgOut.topic = msgOut.deviceId+"/"+msgOut.nodeId+"/"+msgOut.propertyId;
    }

    // Format output Message
    this.broker.on('message', function (msgOut) {
      var log = "homie message arrived ("+node.deviceID+"/"+node.nodeID+"/"+node.propertyID+"):";
      if (msgOut===undefined) return;
      if (node.deviceID=='[any]' || node.deviceID===msgOut.deviceId) {
        log += " " + node.deviceID + "=" + msgOut.deviceId;
        if (node.nodeID=='[any]' || node.nodeID===msgOut.nodeId) {
          log += " " + node.nodeID + "=" + msgOut.nodeId;
          if (node.propertyID=='[any]' || node.propertyID==msgOut.propertyId) {
            log += " " + node.propertyID + "=" + msgOut.propertyId + " payload=" + msgOut.payload;
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
                          break;
            }
            if (msgOut.error.status!=='error') node.addUiControl(msgOut); // only add UI controls if there was NO error
            node.prepareMsgOut(msgOut);

            if (!msgOut.topic) return;
            if (!node.infoTiming) delete msgOut.timing;
            if (!node.infoAttributes) delete msgOut.attributes;
            if (!node.infoError && msgOut.error.status==='ok') delete msgOut.error;
            // console.log("broker.on",msgOut);
            if (msgOut.error===undefined || msgOut.error.status!=='error') node.send([msgOut,null]);
              else node.send([null,msgOut]); // send error Message only.
            node.addToLog("trace",log);
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
      if (config.itemID!='treeList') { // ignore duplicates except for tree list
        for (var i=0; i<devices.length; i++) { // filter duplicate items.
          if (devices[i].name==item.name) return;
        }
      } else { // fill tree list
//        var objectIds= broker.getAllIDs(device.deviceId,node.$name,item.name);
        broker.validateHomie('property',device.deviceId,node.nodeId,property.propertyId,false);
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
    var addExtensionItemToList = function (item) {
      if (config.itemID!='treeList') { // ignore duplicates except for tree list
        for (var i=0; i<devices.length; i++) { // filter duplicate items.
          if (devices[i].name==item.name) return;
        }
      } else { // fill tree list
        item.class= 'palette-header';
        item.label=device.$name+"/"+item.name;

        item.children=[];
        item.children.push({label: "extension :"+ item.name.substr(0,item.name.indexOf('/')), icon: "fa fa-cogs"});
        item.children.push({label: "property :"+ item.value, icon: "fa fa-info"});
        item.children.push({label: "payload : "+ (node[item.value] || "n/a"), icon: "fa fa-envelope-open-o"});

  	    item.icon="fa fa-bolt ";
      }
      devices.push(item);
    }

    var addExtensionPropertyToList = function (item) {
      if (config.itemID!='treeList') { // ignore duplicates except for tree list
        for (var i=0; i<devices.length; i++) { // filter duplicate items.
          if (devices[i].name==item.name) return;
        }
        addExtensionItemToList(item);
      } else { // for treeList filter selected property
        if (config.propertyID=='[any]' || config.propertyID==item.value) { // [any] property or property name matches
          addExtensionItemToList(item);
        }
      }
    }
    
    var addPropertyToList = function (item) {
      property=node[item.value];
      if (!property.$settable) propertySettable = false;
        else propertySettable=property.$settable;
      if (typeof config.settable=="string") config.settable=(config.settable==="true");
      // config.addToLog("debug","addPropertyToList : "+config.settable+"("+typeof config.settable+") : "+propertySettable+" : "+item.name);
      if (config.itemID!='treeList') { // ignore duplicates except for tree list
        for (var i=0; i<devices.length; i++) { // filter duplicate items.
          if (devices[i].name==item.name) return;
        }
        if (config.settable==false) addItemToList(item); // $settable filter not set
          else if (propertySettable) addItemToList(item); // match properties with $settable flag set 
      } else { // for treeList filter selected property
        if (config.propertyID=='[any]' || config.propertyID==item.value) { // [any] property or property name matches
          if (config.settable==false) addItemToList(item); // $settable filter not set
            else if (propertySettable) addItemToList(item); // match properties with $settable flag set 
        }
      }
    }
    
    var addNodeToList = function (item) {

      // config.addToLog("debug","addNodeToList : "+config.$settable+" : "+item.$settable+" : "+item.name);
      node = device[item.value];
      if (node!==undefined) {
        if (node.nodeId && node.nodeId.substr(0,1)=='$') node.itemList.forEach(addExtensionPropertyToList)
        else node.itemList.forEach(addPropertyToList);
      }
    }

    var addStateToList = function (device) {
    var item = {};
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
    item.class= 'palette-header';
    item.label= device.$name + " [" + device.$state + "]";
    item.icon= homieDef.$state.format[device.$state];
    item.children=[];
    // console.log("statsList",device)
    for (var element in device) {
      if (homieDef.hasOwnProperty(element)) {
        if (homieDef[element] && homieDef[element].hasOwnProperty("icon")) {
          item.children.push({"label": element +" = "+ (device[element] || "n/a")+" "+homieDef[element].unit, "icon": homieDef[element].icon});
        } else {
          if (typeof device[element] === "object") {
            for (var subElement in device[element]) {
              // console.log(element,subElement,device[element][subElement]);
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
    devices.push(item);
    }

    // config.addToLog("debug","/homieConvention/deviceList called for broker " + config.name + " query: "+ config.itemID+" Filter D:"+config.deviceID+" N:"+config.nodeID+" P:"+config.propertyID+" S:"+config.settable);
    var errorStr = "";
    switch (config.itemID) {
      case 'stateDeviceID':
      case 'deviceID':    devices = broker.homieDevices;
                          break;
      case 'nodeID':      if (config.deviceID!="[any]") { // nodes from a specific device
                            if (broker.homieData[config.deviceID] && broker.homieData[config.deviceID].itemList) {
                              devices=broker.homieData[config.deviceID].itemList
                            } else {
                              devices=[{"name":"NO Devices found!","value":"NO Devices found"}];
                            }
                          } else { // nodes from [any] Device
                              for (var deviceName in broker.homieData) {
                                device=broker.homieData[deviceName];
                                if (device.itemList) {
                                  device.itemList.forEach(addItemToList);
                                } 
                              }
                            }
                          break;
      case 'propertyID':
      case 'treeList': 
        // node.addToLog("debug","deviceList : "+config.deviceID+"/"+config.nodeID+"/"+config.propertyID+" Settable:"+config.settable);

        if (config.deviceID!=="[any]" && config.nodeID!=="[any]") { // property from a specific device and node
          device = broker.homieData[config.deviceID];
          node = broker.homieData[config.deviceID][config.nodeID];
          if (device!==undefined && node!==undefined) {
            if (config.nodeID.substr(0,1)=='$') node.itemList.forEach(addExtensionPropertyToList)
            else node.itemList.forEach(addPropertyToList);
          }
        } else {
          if (config.deviceID==="[any]") { // Include [any] device. loop through devices
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
            if (broker && broker.homieData && broker.homieData.hasOwnProperty(config.deviceID)) {
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
        }
        break;
      case 'stateList':
        for (var deviceName in broker.homieData) {
          device=broker.homieData[deviceName];
          addStateToList(device);
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
