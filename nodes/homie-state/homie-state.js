module.exports = function (RED) {
  function homieState (config) {
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
          if (state.startsWith('connected')) {
            msgOut.state.$state="ready";
            status.shape = 'dot';
            status.fill = 'green';
          } else {
            msgOut.state.$state="alert"
          }
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
    this.baseID = config.baseID;
    this.deviceID = config.deviceID;
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

    this.on('input', function(msg, send, done) {
      send = send || function() { node.send.apply(node,arguments) }
      if (msg.hasOwnProperty('broker') && msg.broker!==node.broker.brokerurl) {
        if (done) done();
        return; // to be multi broker safe.
      };

      var result = false;
      var baseList=[];
      if (!msg.hasOwnProperty('baseId')) msg.baseId='[any]';
      if (!msg.hasOwnProperty('deviceId')) msg.deviceId='[any]';

      if (msg.hasOwnProperty('payload')) {
        let topicSplitted = msg.payload.split('/');
        msg.baseId = topicSplitted.shift();
        if (topicSplitted.length>0) {
          msg.deviceId = topicSplitted.shift();
        } else {
          msg.deviceId = '[any]';
        }
      }
      var stateMsg = {"topic": node.broker.brokerurl+'/'+msg.baseId+'/'+msg.deviceId};
      if (msg.baseId==='[any]') {
        baseList=Object.keys(node.broker.homieData)
      } else {
        if (node.broker.homieData.hasOwnProperty(msg.baseId)) {
          baseList=[msg.baseId];
        } else {
          addToLog('error',`Unknown baseId: ${msg.baseId}`);
          if (done) done();
          return;
        }
      }

      baseList.forEach(base => {
        Object.keys(node.broker.homieData[base]).forEach(device => {
          if (msg.deviceId==='[any]' || device === msg.deviceId) {
            stateMsg = {
              "topic": node.broker.brokerurl+'/'+base+'/'+device,
              "baseId":base,
              "deviceId":device,
              "typeId":'stateRequest',
              "state":{"$name":base+'/'+device}
            };
            result = node.buildStateObject(node.broker.homieData[base][device],stateMsg.state);
            if (!result) {
              delete stateMsg.state;
              stateMsg.error={status: "error", error: device.name+" not found"}
            }
            send([stateMsg]);
          }
        });
      });
      if (done) done();
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
    this.broker.on('message', function (msg, send, done) {
      send = send || function() { node.send.apply(node,arguments) }
      
      if ((msg!==undefined) &&
          (msg.typeId==='homieAttribute' || msg.typeId==='homieExtension') && 
          (node.baseID==='[any]' || node.baseID===msg.baseId) && 
          (node.deviceID==='[any]' || node.deviceID===msg.deviceId)) {

        const triggerKeys = ['$stats', '$homie', '$nodes', '$extensions', '$state', '$fw', '$localip', '$mac', '$implementation'];
        if (triggerKeys.includes(msg.nodeId)) {
          var a = msg.value;
          var b = msg.valueBefore;
          if (a != b) {
            if (!msg.hasOwnProperty('state')) {
              msg.state={};
            }
            msg.state.$name=msg.deviceId;
            msg.state[msg.propertyId]=msg.value;
            node.prepareMsgOut(msg);
            msg.topic= node.broker.brokerurl+'/'+msg.baseId+'/'+msg.deviceId;
            send([msg]);
          }
        }
      }
      if (done) done();
    });
  }

  RED.nodes.registerType('homie-convention-state', homieState);

};
