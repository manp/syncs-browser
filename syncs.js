"use strict";
class Syncs {
    /**
     * @constructor
     * @param path
     * @param debug
     */
    constructor(configs = {}) {
        this.socketId = null;
        this.online = false;
        this.configs = {};
        this.onMessageListeners = [];
        this.handledClose = false;
        this.subscriptions = new Map();
        this.globalSharedObjects = new Map();
        this.groupSharedObjects = new Map();
        this.clientSharedObjects = new Map();
        this.rmiFunctions = {};
        this.rmiResultCallbacks = new Map();
        this.initializeConfigs(configs);
        if (this.configs.autoConnect) {
            this.connect();
        }
    }
    /**
     * initialize configuration with user inputs or default configurations
     * @param {SyncsConfig} configs
     */
    initializeConfigs(configs) {
        this.configs.path = configs.path || 'ws://' + location.host + '/syncs';
        this.configs.autoConnect = configs.autoConnect == undefined ? true : configs.autoConnect;
        this.configs.autoReconnect = configs.autoReconnect == undefined ? true : configs.autoReconnect;
        this.configs.reconnectDelay = configs.reconnectDelay || 1000;
        this.configs.debug = configs.debug || false;
    }
    /**
     * enables debug mode
     */
    enableDebugMode() {
        this.configs.debug = true;
    }
    /**
     * disables debug mode
     */
    disableDebugMode() {
        this.configs.debug = false;
    }
    /**
     * connects to Syncs server
     */
    connect() {
        if (this.online) {
            return;
        }
        this.socket = new WebSocket(this.configs.path);
        this.handleOnMessage();
        this.handleOnClose();
    }
    /**
     * handles incoming messages
     */
    handleOnMessage() {
        this.socket.addEventListener('message', (message) => {
            let parsedMessage = this.parseMessage(message.data);
            if (parsedMessage) {
                if (parsedMessage.command && parsedMessage.type) {
                    this.handleCommand(parsedMessage);
                }
                else {
                    for (let listener of this.onMessageListeners) {
                        listener(parsedMessage);
                    }
                }
            }
        });
    }
    /**
     * handle connection close
     */
    handleOnClose() {
        this.socket.addEventListener('close', () => {
            this.online = false;
            if (this.handledClose || !this.configs.autoReconnect) {
                this.handledClose = false;
                if (this.onCloseListener) {
                    this.onCloseListener(this);
                }
            }
            else {
                if (this.onDisconnectListener) {
                    this.onDisconnectListener(this);
                }
                setTimeout(() => {
                    if (!this.online) {
                        this.connect();
                    }
                }, this.configs.reconnectDelay);
            }
        });
    }
    /**
     * disconnect from Syncs server
     */
    disconnect() {
        this.handledClose = true;
        this.socket.close();
    }
    /**
     * handle open event
     * open event will emit on first connection
     * @param { (server: Syncs) => {} } callback
     */
    onOpen(callback) {
        this.onOpenListener = callback;
    }
    /**
     * handle close event
     * this event will emit on close
     * @param { (server: Syncs) => {} } callback
     */
    onClose(callback) {
        this.onCloseListener = callback;
    }
    /**
     * handle disconnect event
     * this event will emit on unhandled close
     * @param { (server: Syncs) => {} } callback
     */
    onDisconnect(callback) {
        this.onDisconnectListener = callback;
    }
    /**
     * parse incoming message
     * returns parsed object or false if message is not valid
     * @param {string} message
     * @return {any|false}
     */
    parseMessage(message) {
        try {
            return JSON.parse(decodeURI(message));
        }
        catch (e) {
            return false;
        }
    }
    /**
     * handle incoming command
     * @param {any} command
     */
    handleCommand(command) {
        if (this.configs.debug) {
            console.log("\u2B07", 'INPUT COMMAND:', command);
        }
        switch (command.type) {
            case 'getSocketId':
                this.sendSocketId();
                if (this.socketId && this.onOpenListener) {
                    this.onOpenListener(this);
                }
                break;
            case 'setSocketId':
                this.socketId = command.socketId;
                this.online = true;
                if (this.onOpenListener) {
                    this.onOpenListener(this);
                }
                break;
            case 'event':
                this.handleEvent(command);
                break;
            case 'sync':
                this.handleSync(command);
                break;
            case 'rmi':
                this.handleRMICommand(command);
                break;
            case 'rmi-result':
                this.handleRmiResultCommand(command);
                break;
        }
    }
    /**
     * send socketId to Syncs server
     */
    sendSocketId() {
        if (this.socketId) {
            this.sendCommand({ type: 'reportSocketId', socketId: this.socketId });
            this.online = true;
        }
        else {
            this.sendCommand({ type: 'reportSocketId', socketId: null });
        }
    }
    /**
     * handle incoming message
     * @param { (message: any) => void } listener
     */
    onMessage(listener) {
        this.onMessageListeners.push(listener);
    }
    /**
     * send message to Syncs server
     * @param {any} message
     * @return {boolean}
     */
    send(message) {
        if (this.online) {
            this.socket.send(encodeURI(JSON.stringify(message)));
            return true;
        }
        return false;
    }
    /**
     * send message as syncs-command
     * @param {any} message
     * @return {boolean}
     */
    sendCommand(message) {
        try {
            message.command = true;
            if (this.configs.debug) {
                console.log("\u2B06", 'OUTPUT COMMAND:', message);
            }
            this.socket.send(encodeURI(JSON.stringify(message)));
            return true;
        }
        catch (e) {
            return false;
        }
    }
    /**************  EVENT LAYER ******************/
    /**
     * handle incomming event
     * @param {any} command
     */
    handleEvent(command) {
        if (command.event) {
            let subscription = this.subscriptions.get(command.event);
            if (subscription) {
                subscription.forEach((callback) => {
                    callback(command.data);
                });
            }
        }
    }
    /**
     * subscribe on incoming event
     * @param {string} event
     * @param { (data: any) => void } callback
     */
    subscribe(event, callback) {
        if (!this.subscriptions.has(event)) {
            this.subscriptions.set(event, new Set());
        }
        this.subscriptions.get(event).add(callback);
    }
    /**
     * un-subscribe from event
     * @param {string} event
     * @param {callback: (data: any) => void} callback
     */
    unSubscribe(event, callback) {
        if (!this.subscriptions.has(event)) {
            return;
        }
        this.subscriptions.get(event).delete(callback);
    }
    /**
     * publish an event to Syncs Server
     * @param {string} event
     * @param {any} data
     * @return {boolean}
     */
    publish(event, data) {
        return this.sendCommand({ type: 'event', event: event.toString(), data: data });
    }
    /**************  SHARED OBJECT LAYER ******************/
    /**
     * handle shared object sync command
     * @param command
     */
    handleSync(command) {
        switch (command.scope) {
            case 'GLOBAL':
                this.setGlobalSharedObject(command);
                break;
            case 'GROUP':
                this.setGroupSharedObject(command);
                break;
            case 'CLIENT':
                this.setClientSharedObject(command);
                break;
        }
    }
    /**
     * changes global shared object value
     * @param command
     */
    setGlobalSharedObject(command) {
        if (this.globalSharedObjects.has(command.name)) {
            this.globalSharedObjects.get(command.name).setProperties(command.values);
        }
        else {
            this.globalSharedObjects.set(command.name, SharedObject.globalLevel(command.name, {}, this));
        }
    }
    /**
     * changes group shared object value
     * @param command
     */
    setGroupSharedObject(command) {
        if (!this.groupSharedObjects.has(command.group)) {
            this.groupSharedObjects.set(command.group, new Map());
        }
        let group = this.groupSharedObjects.get(command.group);
        if (group.has(command.name)) {
            group.get(command.name).setProperties(command.values);
        }
        else {
            group.set(command.name, SharedObject.groupLevel(command.name, {}, this));
        }
    }
    /**
     * changes client shared object value
     * @param command
     */
    setClientSharedObject(command) {
        if (this.clientSharedObjects.has(command.name)) {
            this.clientSharedObjects.get(command.name).setProperties(command.values);
        }
        else {
            this.clientSharedObjects.set(command.name, SharedObject.clientLevel(command.name, {}, this));
        }
    }
    /**
     * returns client level shared object
     * @param {string} name
     * @return {any}
     */
    shared(name) {
        if (!this.clientSharedObjects.has(name)) {
            this.clientSharedObjects.set(name, SharedObject.clientLevel(name, {}, this));
        }
        return this.clientSharedObjects.get(name).data;
    }
    /**
     * return group level shared object
     * @param {string} group
     * @param {string} name
     * @return {any}
     */
    groupShared(group, name) {
        if (!this.groupSharedObjects.has(group)) {
            this.groupSharedObjects.set(group, new Map());
        }
        if (!this.groupSharedObjects.get(group).has(name)) {
            this.groupSharedObjects.get(group).set(name, SharedObject.groupLevel(name, {}, this));
        }
        return this.groupSharedObjects.get(group).get(name).data;
    }
    /**
     *
     * @param name
     * @return {any}
     */
    globalShared(name) {
        if (!this.globalSharedObjects.has(name)) {
            this.globalSharedObjects.set(name, SharedObject.globalLevel(name, {}, this));
        }
        return this.globalSharedObjects.get(name).data;
    }
    /**************  RMI LAYER ******************/
    /**
     * returns functions array
     * functions array is the place to initialize rmi functions
     * @return {any}
     */
    get functions() {
        if (!this.functionProxy) {
            this.functionProxy = new Proxy(this.rmiFunctions, {
                set: (target, property, value, receiver) => {
                    this.rmiFunctions[property] = value;
                    return true;
                }
            });
        }
        return this.functionProxy;
    }
    /**
     * handle incoming rmi command
     * @param {string} command
     */
    handleRMICommand(command) {
        if (command.name in this.functions) {
            let result = this.functions[command.name].call(this, ...command.args);
            if (result instanceof Promise) {
                result.then(promiseResult => {
                    this.sendRmiResultCommand(promiseResult, null, command.id);
                }).catch(error => {
                    this.sendRmiResultCommand(null, 'function error', command.id);
                });
            }
            else {
                this.sendRmiResultCommand(result, null, command.id);
            }
        }
        else {
            this.sendRmiResultCommand(null, 'undefined', command.id);
        }
    }
    /**
     * returns an remote functions object
     * remote functions object is the place to call remote functions
     * called method will return Promise to get result from remote
     * @return {any}
     */
    get remote() {
        return new Proxy({}, {
            get: (target, property, receiver) => this.onGetRemoteMethod(target, property, receiver)
        });
    }
    /**
     * handles proxy get for remote method invocation
     * @param target
     * @param property
     * @param receiver
     * @return {()=>Promise<T>}
     */
    onGetRemoteMethod(target, property, receiver) {
        let client = this;
        let id = this.generateRMIRequestUID();
        return function () {
            let args = [];
            for (let name in arguments) {
                args[name] = arguments[name];
            }
            client.sendRMICommand(property, args, id);
            return new Promise((resolve, reject) => {
                client.rmiResultCallbacks.set(id, [resolve, reject]);
            });
        };
    }
    /**
     * generates request id for RMI
     * @return {string}
     */
    generateRMIRequestUID() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }
    /**
     * handles rmi-result command
     * @param command
     */
    handleRmiResultCommand(command) {
        let callbacks = this.rmiResultCallbacks.get(command.id);
        if (command.error) {
            callbacks[1].call(this, command.error);
        }
        else {
            callbacks[0].call(this, command.result);
        }
        this.rmiResultCallbacks.delete(command.id);
    }
    /**
     * sends rmi calling command to Syncs server;
     * @param {string} name
     * @param {any} args
     * @param {string} id
     */
    sendRMICommand(name, args, id) {
        this.sendCommand({
            type: "rmi",
            id: id,
            name: name,
            args: args
        });
    }
    /**
     * send rmi-result command to SyncsServer
     * @param result
     * @param error
     * @param id
     */
    sendRmiResultCommand(result, error, id) {
        this.sendCommand({
            type: "rmi-result",
            id: id,
            result: result,
            error: error
        });
    }
}
/**
 * Shared Object Class to create Shared Object functionality
 */
class SharedObject {
    constructor() {
        this.rawData = function (event) { };
        this.readOnly = true;
    }
    /**
     * creates a global level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    static globalLevel(name, initializeData, server) {
        let result = new SharedObject();
        result.name = name;
        result.type = 'GLOBAL';
        result.readOnly = true;
        result.rawData.data = initializeData;
        result.server = server;
        result.initialize();
        return result;
    }
    /**
     * creates group level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    static groupLevel(name, initializeData = {}, server) {
        let result = new SharedObject();
        result.name = name;
        result.type = 'GROUP';
        result.readOnly = true;
        result.rawData.data = initializeData;
        result.server = server;
        result.initialize();
        return result;
    }
    /**
     * creates client level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    static clientLevel(name, initializeData = {}, server) {
        let result = new SharedObject();
        result.name = name;
        result.type = 'CLIENT';
        result.readOnly = false;
        result.rawData.data = initializeData;
        result.server = server;
        result.initialize();
        return result;
    }
    /**
     * initialize proxy object to observe changes in raw data
     */
    initialize() {
        this.proxy = new Proxy(function () {
        }, this.getHandler());
    }
    /**
     * returns handlers for proxy
     * @return {{get: ((target:any, property:any, receiver:any)=>any|string|number), set: ((target:any, property:any, value:any, receiver:any)=>boolean), apply: ((target:any, thisArg:any, argumentsList:any)=>any)}}
     */
    getHandler() {
        return {
            get: (target, property, receiver) => this.onGet(target, property, receiver),
            set: (target, property, value, receiver) => this.onSet(target, property, value, receiver),
            apply: (target, thisArg, argumentsList) => this.onApply(target, thisArg, argumentsList)
        };
    }
    onGet(target, property, receiver) {
        if (property in this.rawData.data) {
            return this.rawData.data[property];
        }
        return null;
    }
    onApply(target, thisArg, argumentsList) {
        if (argumentsList.length > 0) {
            this.onChangeHandler = argumentsList[0];
        }
        return this.proxy;
    }
    onSet(target, property, value, receiver) {
        if (this.readOnly) {
            return false;
        }
        this.rawData.data[property] = value;
        if (this.onChangeHandler) {
            let values = {};
            values[property] = value;
            this.onChangeHandler({ values: values, by: 'client' });
        }
        this.sendSyncCommand(property);
        return true;
    }
    /**
     * sends syncs command to Syncs Server
     * @param property
     */
    sendSyncCommand(property) {
        let command = {
            type: 'sync',
            name: this.name,
            scope: 'CLIENT',
            key: property,
            value: this.rawData.data[property]
        };
        this.server.sendCommand(command);
    }
    /**
     * returns abstracted shared object as a proxy
     * @return {any}
     */
    get data() {
        return this.proxy;
    }
    /**
     * apply changes from server to shared object
     * @param values
     */
    setProperties(values) {
        for (let key in values) {
            this.rawData.data[key] = values[key];
        }
        if (this.onChangeHandler) {
            this.onChangeHandler({ values: values, by: 'server' });
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luY3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzeW5jcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7SUFxQkk7Ozs7T0FJRztJQUNILFlBQVksT0FBTyxHQUFhLEVBQUU7UUF0QjFCLGFBQVEsR0FBVyxJQUFJLENBQUM7UUFDekIsV0FBTSxHQUFZLEtBQUssQ0FBQztRQUN2QixZQUFPLEdBQWdCLEVBQUUsQ0FBQztRQUMxQix1QkFBa0IsR0FBVSxFQUFFLENBQUM7UUFDL0IsaUJBQVksR0FBRyxLQUFLLENBQUM7UUFDckIsa0JBQWEsR0FBMEMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNqRSx3QkFBbUIsR0FBOEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUMzRCx1QkFBa0IsR0FBMkMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN2RSx3QkFBbUIsR0FBK0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUs1RCxpQkFBWSxHQUFRLEVBQUUsQ0FBQztRQUN2Qix1QkFBa0IsR0FBdUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQVN2RSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDaEMsRUFBRSxDQUFBLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNLLGlCQUFpQixDQUFDLE9BQW9CO1FBQzFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDO1FBQ3ZFLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQyxXQUFXLElBQUUsU0FBUyxHQUFHLElBQUksR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDO1FBQ3ZGLElBQUksQ0FBQyxPQUFPLENB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