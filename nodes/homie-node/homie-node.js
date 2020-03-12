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
    this.nodeId = config.nodeId;
    this.nodeName = config.nodeName;
    this.nodeType = config.nodeType;
    this.passMsg=config.passMsg; // pass messages from input to output
    this.autoConfirm=config.autoConfirm; // autoConfirm /set messages
    this.infoError=config.infoError; // include Error messages
    this.infoHomie=config.infoHomie; // include Homie
    this.exposeHomieNodes=config.exposeHomieNodes; // expose homieNodes in global context;
    this.homieNodeConfig=JSON.parse(config.homieNodeConfig); // homie config via Editor
    this.inputs = 1;
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
        RED.log[type]("[homie.state:"+node.nodeName+"] "+node.log[type]);
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
      switch (def.type) {
        case 'enum':
          if (!def.format.includes(property)) return false;
          break;
      }
      return true;
    };

    this.isProperty = function (property) {
      return !property.startsWith('$');
    }

    this.mqttPublish = function (topic,property,retained = true){
      node.addToLog("info","send: "+topic+"="+ property+" retained: "+retained);
      node.broker.client.publish(topic, property, { qos: 2, retain: retained });
    }

    this.updateHomieValue = function (homieNode,propertyId,value) {
      var success = true;
      if (homieNode.hasOwnProperty(propertyId)) {
        let homieProperty=homieNode[propertyId];
        if (value===undefined) { // delete topic
          node.mqttPublish(node.broker.baseTopic + '/' + node.nodeId + '/' + propertyId,undefined);
        } else if (homieProperty.hasOwnProperty("value")) {
          let currentValueString = (homieProperty.value!=null) ? node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,homieProperty.value) : "";
          let newValueString = node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,value);
          if (currentValueString!=newValueString) { // only if new or updated
            if (!(homieProperty.$datatype==="enum" && newValueString==="")) {
              node.mqttPublish(node.broker.baseTopic + '/' + node.nodeId + '/' + propertyId,newValueString,homieProperty.$retained);
              homieProperty.valuePredicted=value;
            } else success = false;
          }
        }
      }
      return success;
    }

    this.updateHomieAttribute = function (propertyId,homieNode,property,key,def) {
      if (!homieNode.hasOwnProperty(key) || homieNode[key]!==property) { // Attribute new of differ from previous
        if (node.validateProperty(property,def)) {
          homieNode[key]=property;
          node.mqttPublish(node.broker.baseTopic + '/' + node.nodeId + ((propertyId!=="") ? '/' + propertyId : '') + '/' + key,property);
        } else {
          node.errorMessages.push({source:"updateHomieAttribute",message:"property misformed ("+key+")",level:"warn"});
        }
      }
      return true;
    }
    
    this.updateHomieProperty = function (nodeId,homieNode,propertyId,properties,def) {
      if (!homieNode.hasOwnProperty(propertyId)) {// init property object
        homieNode[propertyId]={"value":null};
        node.addToLog("info","new property "+propertyId+" ("+Object.keys(homieNode).filter(node.isProperty).toString()+")");
        node.mqttPublish(node.broker.baseTopic+"/"+nodeId+"/$properties",Object.keys(homieNode).filter(node.isProperty).toString());
      }
      var property = properties[propertyId];
      if (typeof property === 'object' && !Array.isArray(property)){
        Object.keys(property).forEach((key) => {
          if (def.hasOwnProperty(key)) {
            node.updateHomieAttribute(propertyId,homieNode[propertyId],property[key],key,def[key]);
          } else node.errorMessages.push({source:"updateHomieProperty",message:"unknown key defined ("+key+")",level:"warn"});
        });
      } else {
        node.errorMessages.push({source:"updateHomieProperty",message:"object expected! found "+typeof properties,level:"error"});
        return false;
      }
      return true;
    }
    
    this.updateHomieNode = function (msg) {
      var result=false;
      var context = node.context().global;
      if (!node.broker.hasOwnProperty("homieNodes")) node.broker.homieNodes = {};
      var homieNodes = node.broker.homieNodes;
      if (!homieNodes.hasOwnProperty(node.broker.brokerurl)) { // first node
        node.addToLog("info","first node @ "+node.broker.brokerurl);
        homieNodes[node.broker.brokerurl]={};
      }
      var homieNode = homieNodes[node.broker.brokerurl];
      var nodeId = msg.nodeId || node.nodeId; // use msg.nodeId first
      if (!homieNode.hasOwnProperty(nodeId)) { // new node
        homieNode[nodeId]={};
        node.addToLog("info","new node "+nodeId+" ("+Object.keys(homieNode).toString()+")");
        node.mqttPublish(node.broker.baseTopic+"/$nodes",Object.keys(homieNode).toString());
      }
      homieNode=homieNode[nodeId];
      if (!homieNode.hasOwnProperty("$properties")) homieNode.$properties={}; // init $properties list
      
      var homieNodeDef = node.broker.homieNodeDef;
      result=Object.keys(msg.homie).forEach((key) => {
        if (homieNodeDef.hasOwnProperty(key)) {
            if (key!=='$properties') {
              result = node.updateHomieAttribute("",homieNode,msg.homie[key],key,homieNodeDef[key]);
            } else {
              Object.keys(msg.homie[key]).forEach((property) => {
                result = node.updateHomieProperty(nodeId,homieNode,property,msg.homie[key],homieNodeDef._properties);
              });
            }
        }
      });
      // node.broker.homieNodes = homieNodes;
      if (node.exposeHomieNodes) {
        context.set("homieNodes",node.broker.homieNodes);
      } else {
        context.set("homieNodes",undefined);
      }                           
      return result
    }

    // homie node is configured by the configuration editor on startup
    if (node.homieNodeConfig && node.homieNodeConfig.hasOwnProperty('homie')) {
      node.updateHomieNode(node.homieNodeConfig);
      if (node.errorMessages.length>0) node.status({fill: 'red', shape: 'dot', text: 'homie configuration has '+ node.errorMessages.length +' errors'});
    }

    this.on('input', function(msg) {
      var success = true;
      // homie configuration object arrived
      if (msg.hasOwnProperty('homie')) { 
        success=node.updateHomieNode(msg);
        if (node.errorMessages.length>0) node.status({fill: 'red', shape: 'dot', text: 'msg.homie has '+ node.errorMessages.length +' errors'});
        else node.status({fill: 'green', shape: 'dot', text: 'msg.homie imported'});
      }
      if (!success && node.infoError && node.errorMessages.length>0) { // add error list to message
        msg.error=RED.util.cloneMessage(node.errorMessages);
        node.send([msg]); // only send msg on error
        return; // better stop here until errors are fixed!
      }

      // update Node-RED device on broker
      if (msg.hasOwnProperty('topic') && msg.topic!="" && msg.hasOwnProperty('payload') && node.broker.hasOwnProperty("homieNodes")) {
        var topicSplitted=msg.topic.split('/');
        var homieNodes = node.broker.homieNodes[node.broker.brokerurl];
        var deviceId = (topicSplitted.length>2) ? topicSplitted[topicSplitted.length-3] : node.broker.homieName;
        if (deviceId == node.broker.homieName) {
          var nodeId = (topicSplitted.length>1) ? topicSplitted[topicSplitted.length-2] : node.nodeId;
          var propertyId = topicSplitted[topicSplitted.length-1];
          if (homieNodes!==undefined && homieNodes.hasOwnProperty(nodeId)) {
            var homieNode=homieNodes[nodeId];
            success = node.updateHomieValue(homieNode,propertyId,msg.payload);
            if (success) {
              node.status({fill: 'green', shape: 'dot', text: propertyId+'='+((typeof msg.payload === "object") ? JSON.stringify(msg.payload) : msg.payload )});
            } else {
              node.status({fill: 'yellow', shape: 'dot', text: propertyId+'='+((typeof msg.payload === "object") ? JSON.stringify(msg.payload) : msg.payload )+" failed! $datatype="+homieNode[propertyId].$datatype+" $format="+homieNode[propertyId].$format});
            }
          }
        }
      }
      //  no msg here! reply should come back form the broker!
    });
    
    // handle message for mqtt broker to Node-REd (as device)
    this.broker.on('redHomieMessage', function (msg) {
      if (msg.hasOwnProperty("property") || msg.payload==="") return;
      if (!node.hasOwnProperty("id")) return;
      node = RED.nodes.getNode(node.id);
      if (node && node.broker && node.broker.hasOwnProperty("homieNodes")) {
        var originalPayload = msg.payload;
        var topicSplitted=msg.topic.split('/');
        if (topicSplitted.length>3 && topicSplitted[2]==node.nodeId) {
          var homieNodes = node.broker.homieNodes[node.broker.brokerurl];
          var propertyId = topicSplitted[3];
          var nodeId = node.nodeId;
          if (homieNodes!==undefined && homieNodes.hasOwnProperty(nodeId) && homieNodes[nodeId].hasOwnProperty(propertyId)) {
            var homieProperty = homieNodes[nodeId][propertyId];
            // this node ONLY accepts messages on the /set topic! $settable must be true!
            if (topicSplitted[4]=='set' && homieProperty.$settable) {
              msg.property = {value:homieProperty.value};
              result = node.broker.formatStringToValue(homieProperty.$datatype,homieProperty.$format,msg.property,msg.payload);
              msg.payload=msg.property.value;
              if (node.autoConfirm && topicSplitted[4]=='set') node.updateHomieValue(homieNodes[nodeId],propertyId,originalPayload);
              homieProperty.value=msg.property.value;
              if (node.infoHomie) msg.homie=RED.util.cloneMessage(homieProperty);
              if (node.passMsg || topicSplitted[4]=='set') node.send([msg]);
              node.status({fill: 'green', shape: 'dot', text: propertyId+'/set ='+originalPayload});
            } else { // reset property to stored value

              var updateProperty = function() {
                msg.property = {value:homieProperty.value};
                node.broker.formatStringToValue(homieProperty.$datatype,homieProperty.$format,msg.property,originalPayload);
                homieProperty.value=msg.property.value;
                if (homieProperty.$datatype!=="enum") {
                  msg.payload=msg.property.value;
                } else if (homieProperty.hasOwnProperty("$format")) {
                  let options = homieProperty.$format.split(',');
                  msg.payload = options[msg.property.value];
                  msg.option = msg.property.value;
                }
                if (node.passMsg) node.send([msg]);
                delete homieProperty.valuePredicted;
              }

              if (topicSplitted[4]=='set' && !homieProperty.$settable) {
                node.addToLog("warn","/set message not accepted because property $settable=false!");
                node.mqttPublish(node.broker.baseTopic + '/' + node.nodeId + '/' + propertyId + '/set',undefined);
                node.status({fill: 'yellow', shape: 'dot', text: propertyId+'/set but NOT $settable'});
              } else {
                // reject all property changes form outside except the first time
                if (homieProperty && homieProperty.hasOwnProperty("value") && homieProperty.value!==null) {
                  if (homieProperty.hasOwnProperty("valuePredicted") && 
                      node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,homieProperty.valuePredicted)!=originalPayload) {
                    node.status({fill: 'yellow', shape: 'dot', text: propertyId+' changed externally! rejected'});
                    node.addToLog("warn",nodeId+'/'+propertyId+'='+originalPayload+" update form outside detected. Original value restored! ("+homieProperty.value.toString()+")");
                    node.mqttPublish(node.broker.baseTopic + '/' + node.nodeId + '/' + propertyId,
                      node.broker.formatValueToString(homieProperty.$datatype,homieProperty.$format,homieProperty.value));                  
                  } else {
                    updateProperty();
                  }
                } else {
                  updateProperty();
                }
              }
            }
          }
        } else {
          // node.status({fill: 'red', shape: 'dot', text: 'node not defined correctly'});
          node.addToLog("error","node not defined correctly homieNodes="+node.broker.hasOwnProperty(homieNodes));
        }
      }
    });
  }

  RED.nodes.registerType('homie-convention-node', homieExtension);

};
