module.exports = function (RED) {
  function homieDevice (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    // Retrieve the config node, where the device is configured
    node.brokerConfig = RED.nodes.getNode(config.broker);
        

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

    this.broker = RED.nodes.getNode(config.broker);

    this.handleDeviceState(this.broker.state);

    this.broker.on('state', function (state) {
      node.handleDeviceState(state);
    });

    this.broker.on('command', function (nodeId, property, value) {
      node.send({ nodeId: nodeId, property: property, payload: value });
    });
  }

  RED.nodes.registerType('homie-convention-device', homieDevice);

  RED.httpAdmin.get("/homieConvention/deviceList", RED.auth.needsPermission('homie-convention-device.read'), function(req,res) {
    var config = req.query;
    console.log("/homieConvention/deviceList called for broker " + config.name + " ("+ config.broker+")");
    var broker = RED.nodes.getNode(config.broker);
    var devices = broker.homieDevices;
    //var devices = [{name:'device 1'},{name:'device 2'},{name:'device 3'}];
    res.json(devices);
  });
};
