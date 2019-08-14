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
    this.deviceId = config['device-id'];
    this.name = config.name;
    this.homieDevices = [];
    this.baseTopic = 'homie/' + this.deviceId;

    this.client = mqtt.connect({ host: this.mqttHost, port: this.mqttPort, clientId: this.deviceId, will: {
      topic: this.baseTopic + '/$state', payload: 'away', qos: 2, retain: true
    }});
    this.sendProperty = function (nodeId, name, value) {
      node.client.publish(node.baseTopic + '/' + nodeId + '/' + name, value, { qos: 2, retain: true });
    };

    this.client.on('connect', function () {
      console.log("Homie: connect");

      node.setState('connected');

      node.client.publish(node.baseTopic + '/$state', 'ready', { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$name', node.name, { qos: 2, retain: true });
      node.client.publish(node.baseTopic + '/$localip', ip.v4(), { qos: 2, retain: true });

      node.client.subscribe('homie/#', { qos: 2 });
    });

    this.messageArrived = function (topic, message) {
      var splitted = topic.split('/');
      var deviceName = splitted[1];
      var nodeId = splitted[2];
      var property = splitted[3];

      if (node.homieDevices===undefined) node.devices=[];

      var context = node.context().global; // store copy in global context
      var devices=context.get("homieDevices") || {};      
      if (devices[node.name]===undefined) devices[node.name]={};
      if (devices[node.name][deviceName]===undefined) {
        console.log("Homie: Device found :"+ deviceName);
        node.emit('addDevice',deviceName);
        devices[node.name][deviceName]={"name":deviceName};
        node.homieDevices.push({"name":deviceName});
      }
 
      switch (nodeId) {
        case "$homie": {
          devices[node.name][deviceName]={"$homie":message.toString()};
          break;
        }
        case "$name": {
          devices[node.name][deviceName]={"$name":message.toString()};
          break;
        }
        default:
          node.emit('message', nodeId, property, message);
      }
      context.set("homieDevices",devices);
    }

    this.client.on('message', this.messageArrived);

    this.client.on('close', function () {
      node.setState('close');
    });

    this.client.on('offline', function () {
      console.log("Homie: offline");
      node.setState('offline');
    });

    this.client.on('error', function () {
      console.log("Homie: error");
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
