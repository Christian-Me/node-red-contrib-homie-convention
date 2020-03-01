module.exports = function (RED) {
  function homieExtension (config) {
    RED.nodes.createNode(this, config);
    var node = this;

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
    this.broker = RED.nodes.getNode(config.broker);
    this.stateDeviceID = config.stateDeviceID;
    this.infoError=config.infoError; // include Error messages
    this.infoStats=config.infoStats; // include Statistics information
    this.infoFw=config.infoFw; // include Firmware information
    this.infoTiming=config.infoTiming; // include Timing messages
    this.inputs = 1;
    this.lastBrokerState = "";

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
        RED.log[type]("[homie.state:"+node.name+"] "+node.log[type]);
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

    this.on('input', function(msg) {
      var msgError = {status: "error"};
      msgError.function = "input"
      var msgOut = {};
      
      node.addToLog("debug","Message arrived! topic="+msg.topic+" payload="+msg.payload);

    });

    this.buildStateObject= function (device,stateObject) {
      if (!device || typeof device !== "object") return false;
      var crawlElements = function(device,defObject) {
        for (let element in defObject) {
          if (defObject.hasOwnProperty(element)) {
            if (!defObject[element].hasOwnProperty("icon")) {
              if (device.hasOwnProperty(element)) {
                if (!crawlElements(device[element],defObject[element])) return false;
              }
            } else {
              if (element==="*") { // unknown optional parameters (as allowed in $fw)
                for (let optionalData in device) {
                  if (!defObject.hasOwnProperty[optionalData] && device[optionalData].hasOwnProperty("value")) { 
                    stateObject[optionalData]=device[optionalData].value;
                  }
                }
              } else {
                if (device.hasOwnProperty(element)) {
                  stateObject[element]=(typeof device[element] === "object") ? device[element].value : stateObject[element]=device[element];
                }
              }
            }
          }
        }
        return true;
      }
      crawlElements(device,node.broker.homieExDef);
      return true;
    }

    // fill output message with common values
    this.prepareMsgOut = function(msgOut) {
    }

    // Format output Message
    this.broker.on('stateMessage', function (msgOut) {
      const triggerKeys = ['$stats', '$homie', '$nodes', '$extensions', '$state', '$fw', '$localip', '$mac', '$implementation'];
      var log = "homie message arrived ("+node.stateDeviceID+"):";
      if (msgOut===undefined) return;
      if (node.stateDeviceID=='[any]' || node.stateDeviceID===msgOut.deviceId) {
        if (triggerKeys.includes(msgOut.nodeId)) {
/*          if (node.broker.homieExDef.hasOwnProperty(msgOut.nodeId)) {
            var stateMsg = {
              "deviceId":msgOut.deviceId,
              "nodeId":msgOut.nodeId,
              "value":msgOut.value,
              "$datatype":node.broker.homieExDef[msgOut.nodeId].type,
              "state":{"$name":msgOut.deviceId}
            };
            node.buildStateObject(node.broker.homieData[msgOut.deviceId],stateMsg.state);
            stateMsg.topic=msgOut.deviceId+'/'+msgOut.nodeId
            node.emit('stateMessage', stateMsg);
            return;
          }*/
          var a = msgOut.value;
          var b = msgOut.valueBefore;
          if (a != b) {
            //console.log(msgOut);
            if (!msgOut.hasOwnProperty('state')) {
              msgOut.state={};
            }
            msgOut.state.$name=msgOut.deviceId;
            msgOut.state[msgOut.propertyId]=msgOut.value;
            log += " " + msgOut.deviceId + " " +msgOut.nodeId;
            if (msgOut.propertyId) log += "/" + msgOut.propertyId;
            log += "=" + msgOut.value;
            node.prepareMsgOut(msgOut);
            msgOut.topic= node.broker.brokerurl+'/'+node.broker.homieRoot+'/'+msgOut.deviceId;
            node.send([msgOut]);
            node.addToLog("debug",log);
          }
        }
      }
    });
  }

  RED.nodes.registerType('homie-convention-state', homieExtension);

};
