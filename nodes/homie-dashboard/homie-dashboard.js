module.exports = function (RED) {
  function homieDashboard (config) {
    RED.nodes.createNode(this, config);
    var node = this;
    this.startupSent = false; // flag if startup messages are sent
    
    this.handleDeviceState = function (state) {
    };

    this.log = {};
    this.addLabel=config.addLabel; // include msg.label
    this.uiBlockSet=config.uiBlockSet; // block set messages
    this.uiBlockPredicted=config.uiBlockPredicted; // block set messages
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
        RED.log[type]("[homie.dashboard:"+node.name+"] "+node.log[type]);
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
      if (!msgOut.hasOwnProperty('property')) return false;
      var property=msgOut.property;

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
      return true;
    };


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

    this.msgAddLabel = function(msg) {
      msg.label = msg.deviceName;
      try {
        switch (node.addLabel) {
          case 'custom':  
            msg.label = node.labelName;
            break;
          case 'device': msg.label = msg.device.name;
            break;
          case 'node': msg.label = msg.node.name;
            break;
          case 'property':  msg.label = msg.property.name;
            break;
          case 'device/node': msg.label = msg.device.name+"/"+msg.node.name;
            break;
          case 'device/node/property': msg.label = msg.device.name+"/"+msg.node.name+"/"+msg.property.name;
            break;
        }
      }
      catch (err) {
        msg.label = "unknown"
      }
    }

    this.on('input', function(msg, send, done) {
      send = send || function() { node.send.apply(node,arguments) }
      node.addToLog("trace","Message arrived! topic="+msg.topic+" payload="+msg.payload);
      if ((node.uiBlockSet && msg.setFlag===true) || (node.uiBlockPredicted && msg.predicted===true)) {
        node.addToLog("trace",`Message blocked!`);
      } else {
        if (node.addUiControl(msg)) {
          node.msgAddLabel(msg);
          send(msg);
        }
      }
      if (done) done();
    });
  }

  RED.nodes.registerType('homie-convention-dashboard', homieDashboard);

}