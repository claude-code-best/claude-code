# node-socks5-server
A Node.js implementation of a socks5 server written in TypeScript.  
The library handles the protocol side but allows you to gain fine-grained control of connections and how they're handled.
> **Features:**
- Override the handling of socket proxying
- Handle authentication yourself
- Full type support
- Process Duplex streams as connections

## Installation
With npm:
```
npm i @pondwader/socks5-server
```
With yarn:
```
yarn add @pondwader/socks5-server
```
## Basic usage
Spin up a basic socks5 proxy server with just this code:
```js
const { createServer } = require('@pondwader/socks5-server');

createServer({
    port: 5000
})
```
Or handle the listening yourself:
```js
const { createServer } = require('@pondwader/socks5-server');

const server = createServer();
server.listen(5000, '127.0.0.1', () => {
    console.log('Server listening on port 5000');
})
```
## Username-password authentication
```js
const { createServer } = require('@pondwader/socks5-server');

createServer({
    port: 5000,
    auth: {
        username: 'user123',
        password: 'password123'
    }
})
```
Or handle the authentication yourself:
```js
const { createServer } = require('@pondwader/socks5-server');

const server = createServer({
    port: 5000
})

// Using a synchronous function
server.setAuthHandler((conn) => {
    return conn.username === 'user123' && conn.password === 'password123';
})

// Using a promise
server.setAuthHandler((conn) => {
    return new Promise(resolve => {
        resolve(conn.username === 'user123' && conn.password === 'password123');
    })
})

// Using callbacks
server.setAuthHandler((conn, accept, reject) => {
    if (conn.username === 'user123' && conn.password === 'password123') accept();
    else reject();
})
```

## Rejecting connections for breaking ruleset
You can reject connections that beak your ruleset:
```js
const { createServer } = require('@pondwader/socks5-server');

const server = createServer({
    port: 5000
})

// Using a synchronous return
server.setRulesetValidator((conn) => {
    return conn.destPort !== 25;
});

// Using a promise
server.setRulesetValidator((conn) => {
    return new Promise(resolve => {
        resolve(conn.destPort !== 25);
    })
});

// Using callbacks
server.setRulesetValidator((conn, accept, deny) => {
    if (conn.destPort === 25) deny();
    else accept();
});
```
You also have to access to `<Socks5Connection>.destAddress`.

## Handling the proxying of connections
By default the library will handle connections itself using the built in connection handler, but you can override this to use your own handler.  
[See the built in connection handling function here to further your understanding on how to handle connections.](https://github.com/PondWader/node-socks5-server/blob/main/src/connectionHandler.ts)  
You can set your handling function:
```js
const { createServer } = require('@pondwader/socks5-server');

const server = createServer({
    port: 5000
})

server.setConnectionHandler((conn, sendStatus) => {
    const { socket, destAddress, destPort } = conn;

    /*
        You need to send a status before the client should start sending data in the socket.
        If you send REQUEST_GRANTED the client should begin sending data, any other status will close the socket.

        REQUEST_GRANTED,
        GENERAL_FAILURE,
        CONNECTION_NOT_ALLOWED,
        NETWORK_UNREACHABLE,
        HOST_UNREACHABLE,
        CONNECTION_REFUSED,
        TTL_EXPIRED,
        COMMAND_NOT_SUPPORTED
    */

    // Do stuff here
})
```

## Handling commands other than `connect`
The library only has a built in handler for connections using the `connect` command, this is used for TCP socket proxying and is by far the most common command however, you may wish to add support for other commands.  
The other command types are `udp` and `bind`. To handle these you will need to make your own connection handler (see section above). **Note:** the `Socks5Connection` class exposes the `command` property which gives you access to the command sent by the client.  
You will also need to add the commands you want to handle to the supported commands set. The `Socks5Server` class has the `supportedCommands` property which is a [Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set) instance.  
For example:
`<Socks5Server>.supportedCommands.add('udp');`

## You can also pass Duplex streams as connections...
```js
const { Duplex } = require('streams');
server._handleConnection(new Duplex());
```

## Metadata
The `Socks5Connection` class has a metadata attribute which starts as an empty object, you can put data in this to pass data about a connection between seperate handlers.  