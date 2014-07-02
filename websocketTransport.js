/* Copyright Alexander Abushkevich
 * License: BSD
 *
 * Websocket transport.
 * 
 * Features:
 *  * Knows error descriptions
 *  * Handles errors and disconnects
 *  * Maintains request queue and pushes requests on reconnect
 *  * Request queue survives page reloads
 *  * Deferreds do NOT survive page reloads
 *  * Generates and tracks unique request and response identifiers
 * 
 * Usage and Limitations:
 *  * Requests and responses must be JSON serializable
 *  * The focus is on reliability rather than raw speed
 *  * Websocket connection path is hardcoded to /ws/
 * 
 * API:
 *  To enqueue websocket request:
 *  >>> Service.send(your_json_object); // json_object, not string
 *  The request will be sent immediately or as soon as websocket is open.
 * 
 * */


angular.module('kanbanapp').service('websocketTransport', ['$q', '$rootScope', function($q, $rootScope) {
    
    var errcode2msg = function (code) {
        if ((code >= 0) && (code <= 999)) { return {name: undefined, message: "Reserved and not used." }; };
        if (code == 1000) { return {name: "CLOSE_NORMAL", message: "Normal closure; the connection successfully completed whatever purpose for which it was created." }; };
        if (code == 1001) { return {name: "CLOSE_GOING_AWAY", message: "The endpoint is going away, either because of a server failure or because the browser is navigating away from the page that opened the connection." }; };
        if (code == 1002) { return {name: "CLOSE_PROTOCOL_ERROR", message: "The endpoint is terminating the connection due to a protocol error." }; };
        if (code == 1003) { return {name: "CLOSE_UNSUPPORTED", message: "The connection is being terminated because the endpoint received data of a type it cannot accept (for example, a text-only endpoint received binary data)." }; };
        if (code == 1004) { return {name: undefined, message: "Reserved. A meaning might be defined in the future." }; };
        if (code == 1005) { return {name: "CLOSE_NO_STATUS", message: "Reserved.  Indicates that no status code was provided even though one was expected." }; };
        if (code == 1006) { return {name: "CLOSE_ABNORMAL", message: "Reserved. Used to indicate that a connection was closed abnormally (that is, with no close frame being sent) when a status code is expected." }; };
        if (code == 1007) { return {name: undefined, message: "The endpoint is terminating the connection because a message was received that contained inconsistent data (e.g., non-UTF-8 data within a text message)." }; };
        if (code == 1008) { return {name: undefined, message: "The endpoint is terminating the connection because it received a message that violates it\'s policy. This is a generic status code, used when codes 1003 and 1009 are not suitable." }; };
        if (code == 1009) { return {name: "CLOSE_TOO_LARGE", message: "The endpoint is terminating the connection because a data frame was received that is too large." }; };
        if (code == 1010) { return {name: undefined, message: "The client is terminating the connection because it expected the server to negotiate one or more extension, but the server didn\'t." }; };
        if (code == 1011) { return {name: undefined, message: "The server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request." }; };
        if ((code >= 1012) && (code <= 1014)) { return {name: undefined, message: "Reserved for future use by the WebSocket standard." }; };
        if (code == 1015) { return {name: undefined, message: "Reserved. Indicates that the connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can\'t be verified)." }; };
        if ((code >= 1016) && (code <= 1999)) { return {name: undefined, message: "Reserved for future use by the WebSocket standard." }; };
        if ((code >= 2000) && (code <= 2999)) { return {name: undefined, message: "Reserved for use by WebSocket extensions." }; };
        if ((code >= 3000) && (code <= 3999)) { return {name: undefined, message: "Available for use by libraries and frameworks. May not be used by applications." }; };
        if ((code >= 4000) && (code <= 4999)) { return {name: undefined, message: "Available for use by applications." }; };
    };
    
    // -------------------------------------------------------------------------
    // We return this object to anything injecting our service
    var Service = {};
    // Keep all pending requests in local storage until they get responses
    var localStorageKey = 'requestQueue';
    if (!('requestQueue' in localStorage)) {
        localStorage.setItem(localStorageKey, angular.toJson({}));
    };
    // Separate queue for deferreds
    var deferredQueue = {};
    // Create a unique callback ID to map requests to responses
    var currentCallbackId = 0;
    
    // -------------------------------------------------------------------------
    
    
    // -------------------------------------------------------------------------
    // Request queue
    var getQueue = function(){
        return JSON.parse(localStorage.getItem(localStorageKey));
    };
    var saveQueue = function(q){
        return localStorage.setItem(localStorageKey, angular.toJson(q));
    };
    var listener = function (data) {
        var q = getQueue();
        var responseid = data.responseid;
        // If an object with responseid exists in our callbacks object, resolve it
        if(q.hasOwnProperty(responseid)) {
            console.log('Received response for', responseid);
            //if (!callbacks[responseid].sent) {console.log('We did not send that request!')};
            delete q[responseid];
            saveQueue(q);
            if (deferredQueue.hasOwnProperty(responseid)) {
                $rootScope.$apply(deferredQueue[responseid].cb.resolve(data));
                delete deferredQueue[responseid];
            };
        } else {
            console.log('No response id');
        };
        console.log('Queue length', Object.keys(q).length);
    };
    // This creates a new callback ID for a request
    var getCallbackId = function () {
        return Math.random().toString(36).substr(3,18) + + new Date
    };
    // Use this method to send requests
    Service.send = function(request) {
        var defer = $q.defer();
        var q = getQueue();
        var callbackId = getCallbackId();
        request.requestid = callbackId;
        q[callbackId] = { time: new Date(), sent:false, request:request };
        saveQueue(q);
        deferredQueue[callbackId] = { time: new Date(), cb:defer };
        console.log('Queuing request', request, 'Queue length', Object.keys(q).length);
        //Service.ws.send(JSON.stringify(request));
        setTimeout(function () {processQueue(Service.ws)}, 1);
        return defer.promise;
    };
    // -------------------------------------------------------------------------
    
    
    // -------------------------------------------------------------------------
    // Websocket is being initialized here
    var getWsUrl = function (path) {
        var protocol = (window.location.protocol === "https:") ? 'wss:' : 'ws:';
        var host     = (window.location.hostname==='')? 'localhost': window.location.hostname;
        var port     = (window.location.port==='') ? '':(':'+window.location.port);
        return (protocol + '//' + host + port + path);
    };
    var createWebsocket = function (url, ws_onmessage) {
        socket = new ReconnectingWebSocket(url);
        socket.debugAll  =  true;
        socket.onopen    = function (event) { processQueue(socket); };
        socket.onmessage = ws_onmessage;
        socket.onclose   =  function(event) {
                                console.log('Websocket closed', 
                                            event.code, 
                                            errcode2msg(event.code)); 
                                socket.onclose; 
                            };
        window.addEventListener('beforeunload',function(event){socket.close()});
        return socket;
    };
    var ws_onmessage = function (event) {
        console.log("Received message from websocket", event);
        listener(angular.fromJson(event.data));
    };
    var processQueue = function (socket) {
        var q = getQueue();
        if (Object.keys(q).length) {
            for (key in q) {
                if (!q[key].sent) {
                    var request = q[key].request;
                    console.log('Sending request', request);
                    socket.send(JSON.stringify(request));
                    // I cannot find any reliable way 
                    // to confirm whether the data is sent successfully.
                    // Therefore I assume that if there was no exception thrown,
                    // it should be alright...
                    q[key].sent = true;
                    saveQueue(q);
                };
            };
        };
    };
    // -------------------------------------------------------------------------
    
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    Service.ws = createWebsocket(getWsUrl('/ws/'), ws_onmessage);
    return Service;
    // -------------------------------------------------------------------------
}]);
