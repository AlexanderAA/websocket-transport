websocket-transport
===================

Reconnecting websocket transport for Angularjs. Has request queue, survives page reloads.

Depends on:
-----------
 * Reconnecting websocket by Joe Walnes
 * Built for Angularjs, but can be used with other libraries

Features:
---------
 * Knows websocket error descriptions
 * Handles errors and disconnects
 * Maintains request queue and pushes requests on reconnect
 * Request queue survives page reloads
 * Returns deferreds, matches responses with requests

Usage and Limitations:
----------------------
 * Requests and responses must be JSON serializable with JSON.stringify/JSON.parse
 * The focus is on reliability rather than raw speed
 * Websocket connection path is hardcoded to /ws/

API:
----
 To enqueue websocket request:
 ```
 promise = Service.send(your_json_serializable_object);
 ```
 The request will be sent immediately or as soon as websocket is open.
