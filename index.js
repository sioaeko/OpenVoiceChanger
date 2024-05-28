const expressServer = require('./server/server');
const websocketServer = require('./server/websocket-server');

module.exports = {
  startExpressServer: expressServer,
  startWebSocketServer: websocketServer
};
