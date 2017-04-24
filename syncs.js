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
//# sourceMappingURL=syncs.js.map