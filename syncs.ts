class Syncs {
    /*************** PROPERTIES ****************/
    private socket: WebSocket;
    private socketId: string = null;
    public online: boolean = false;
    private configs: SyncsConfig = {};
    private onMessageListeners: any[] = [];
    private handledClose = false;
    private subscriptions: Map<string,Set<(data: any) => void> > = new Map();
    private globalSharedObjects: Map<string,SharedObject > = new Map();
    private groupSharedObjects: Map<string, Map<string,SharedObject> > = new Map();
    private clientSharedObjects: Map< string,SharedObject > = new Map();
    private onOpenListener: (server: Syncs) => void;
    private onDisconnectListener: (server: Syncs) => void;
    private onCloseListener: (server: Syncs) => void;
    private functionProxy: any;
    private rmiFunctions: any = {};
    private rmiResultCallbacks: Map<string, [Function, Function] > = new Map();


    /**
     * @constructor
     * @param path
     * @param debug
     */
    constructor(configs:SyncsConfig={}) {
        this.initializeConfigs(configs);
        if(this.configs.autoConnect){
            this.connect();
        }
    }

    /**
     * initialize configuration with user inputs or default configurations
     * @param {SyncsConfig} configs
     */
    private initializeConfigs(configs: SyncsConfig) {
        this.configs.path = configs.path || 'ws://' + location.host + '/syncs';
        this.configs.autoConnect = configs.autoConnect==undefined ? true : configs.autoConnect;
        this.configs.autoReconnect = configs.autoReconnect==undefined ? true : configs.autoReconnect;
        this.configs.reconnectDelay = configs.reconnectDelay || 1000;
        this.configs.debug = configs.debug || false;
    }


    /**
     * enables debug mode
     */
    public enableDebugMode() {
        this.configs.debug = true;
    }

    /**
     * disables debug mode
     */
    public disableDebugMode() {
        this.configs.debug = false;
    }

    /**
     * connects to Syncs server
     */
    public connect() {
        if(this.online){
            return;
        }
        this.socket = new WebSocket(this.configs.path);
        this.handleOnMessage();
        this.handleOnClose();
    }


    /**
     * handles incoming messages
     */
    private handleOnMessage() {
        this.socket.addEventListener('message', (message: any) => {

            let parsedMessage = this.parseMessage(message.data);
            if (parsedMessage) {
                if (parsedMessage.command && parsedMessage.type) {
                    this.handleCommand(parsedMessage);
                } else {
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
    private handleOnClose() {
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
                    if(!this.online){
                        this.connect();
                    }
                }, this.configs.reconnectDelay);

            }
        });
    }

    /**
     * disconnect from Syncs server
     */
    public disconnect() {
        this.handledClose = true;
        this.socket.close();
    }

    /**
     * handle open event
     * open event will emit on first connection
     * @param { (server: Syncs) => {} } callback
     */
    public onOpen(callback: (server: Syncs) => void) {
        this.onOpenListener = callback;
    }

    /**
     * handle close event
     * this event will emit on close
     * @param { (server: Syncs) => {} } callback
     */
    public onClose(callback: (server: Syncs) => void) {
        this.onCloseListener = callback;
    }

    /**
     * handle disconnect event
     * this event will emit on unhandled close
     * @param { (server: Syncs) => {} } callback
     */
    public onDisconnect(callback: (server: Syncs) => void){
        this.onDisconnectListener = callback;
    }


    /**
     * parse incoming message
     * returns parsed object or false if message is not valid
     * @param {string} message
     * @return {any|false}
     */
    private parseMessage(message: string): (false|any) {
        try {
            return JSON.parse(decodeURI(message));
        } catch (e) {
            return false;
        }
    }

    /**
     * handle incoming command
     * @param {any} command
     */
    private handleCommand(command: any) {
        if (this.configs.debug) {
            console.log("\u2B07",'INPUT COMMAND:', command);
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
    private sendSocketId() {
        if (this.socketId) {
            this.sendCommand({type: 'reportSocketId', socketId: this.socketId});
            this.online = true;
        } else {
            this.sendCommand({type: 'reportSocketId', socketId: null})
        }
    }

    /**
     * handle incoming message
     * @param { (message: any) => void } listener
     */
    public onMessage(listener: (message: any) => void) {
        this.onMessageListeners.push(listener);
    }

    /**
     * send message to Syncs server
     * @param {any} message
     * @return {boolean}
     */
    public send(message: any):boolean {
        if(this.online){
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
    public sendCommand(message: any):boolean {
        try {
            message.command = true;
            if (this.configs.debug) {
                console.log("\u2B06", 'OUTPUT COMMAND:', message);
            }
            this.socket.send(encodeURI(JSON.stringify(message)));
            return true;
        } catch(e){
            return false;
        }
    }


    /**************  EVENT LAYER ******************/

    /**
     * handle incomming event
     * @param {any} command
     */
    private handleEvent(command: any) {
        if (command.event) {
            let subscription = this.subscriptions.get(command.event);
            if (subscription) {
                subscription.forEach((callback) => {
                    callback(command.data);
                })
            }
        }
    }

    /**
     * subscribe on incoming event
     * @param {string} event
     * @param { (data: any) => void } callback
     */
    public subscribe(event: string, callback: (data: any) => void) {
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
    public unSubscribe(event: string, callback: (data: any) => void) {
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
    public publish(event: string, data: any):boolean {
       return this.sendCommand({type: 'event', event: event.toString(), data: data})
    }


    /**************  SHARED OBJECT LAYER ******************/

    /**
     * handle shared object sync command
     * @param command
     */
    private handleSync(command: any) {
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
    private setGlobalSharedObject(command: any) {
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
    private setGroupSharedObject(command: any) {
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
    private setClientSharedObject(command: any) {
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
    public shared(name: string) {
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
    public groupShared(group: string, name: string) {
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
    public globalShared(name: string) {
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
    public get functions() {
        if (!this.functionProxy) {
            this.functionProxy = new Proxy(this.rmiFunctions, {
                set: (target, property, value, receiver) => {
                    this.rmiFunctions[property] = value;
                    return true;
                }
            })
        }
        return this.functionProxy;
    }

    /**
     * handle incoming rmi command
     * @param {string} command
     */
    private  handleRMICommand(command: any) {
        if (command.name in this.functions) {
            let result = this.functions[command.name].call(this, ...command.args);
            if (result instanceof Promise) {
                result.then(promiseResult => {
                    this.sendRmiResultCommand(promiseResult, null, command.id);
                }).catch(error => {
                    this.sendRmiResultCommand(null, 'function error', command.id);
                })
            } else {
                this.sendRmiResultCommand(result, null, command.id);
            }
        } else {
            this.sendRmiResultCommand(null, 'undefined', command.id);
        }
    }

    /**
     * returns an remote functions object
     * remote functions object is the place to call remote functions
     * called method will return Promise to get result from remote
     * @return {any}
     */
    public get remote(): any {
        return new Proxy({}, {
            get: (target, property, receiver) => this.onGetRemoteMethod(target, property, receiver)
        })
    }

    /**
     * handles proxy get for remote method invocation
     * @param target
     * @param property
     * @param receiver
     * @return {()=>Promise<T>}
     */
    private onGetRemoteMethod(target: any, property: any, receiver: any) {
        let client = this;
        let id = this.generateRMIRequestUID();
        return function () {
            let args: any = [];
            for (let name in arguments) {
                args[name] = arguments[name];
            }
            client.sendRMICommand(property, args, id);

            return new Promise((resolve, reject) => {
                client.rmiResultCallbacks.set(id, [resolve, reject]);
            });
        }
    }

    /**
     * generates request id for RMI
     * @return {string}
     */
    private generateRMIRequestUID() {
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
    private handleRmiResultCommand(command: any) {
        let callbacks = this.rmiResultCallbacks.get(command.id);
        if (command.error) {
            callbacks[1].call(this, command.error);
        } else {
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
    private sendRMICommand(name: string, args: any, id: string) {

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
    private sendRmiResultCommand(result: any, error: any, id: string) {
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
    public name: string;
    public rawData: any = function (event: any) {};
    private type: string;
    private readOnly = true;
    private proxy: any;
    private server: Syncs;
    private onChangeHandler: (event: {values: any, by: string}) => void;

    private constructor() {

    }

    /**
     * creates a global level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    public static globalLevel(name: string, initializeData: any, server: Syncs): SharedObject {
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
    public static groupLevel(name: string, initializeData = {}, server: Syncs): SharedObject {
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
    public static clientLevel(name: string, initializeData = {}, server: Syncs): SharedObject {
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
    private initialize() {
        this.proxy = new Proxy(function () {
        }, this.getHandler());
    }

    /**
     * returns handlers for proxy
     * @return {{get: ((target:any, property:any, receiver:any)=>any|string|number), set: ((target:any, property:any, value:any, receiver:any)=>boolean), apply: ((target:any, thisArg:any, argumentsList:any)=>any)}}
     */
    private getHandler() {
        return {
            get: (target: any, property: any, receiver: any) => this.onGet(target, property, receiver),
            set: (target: any, property: any, value: any, receiver: any) => this.onSet(target, property, value, receiver),
            apply: (target: any, thisArg: any, argumentsList: any) => this.onApply(target, thisArg, argumentsList)
        }
    }

    private onGet(target: any, property: any, receiver: any) {
        if (property in this.rawData.data) {
            return this.rawData.data[property];
        }
        return null;
    }

    private onApply(target: any, thisArg: any, argumentsList: any) {
        if (argumentsList.length > 0) {
            this.onChangeHandler = argumentsList[0];
        }
        return this.proxy;
    }

    private onSet(target: any, property: any, value: any, receiver: any) {
        if (this.readOnly) {
            return false;
        }
        this.rawData.data[property] = value;
        if (this.onChangeHandler) {
            let values: any = {};
            values[property] = value;
            this.onChangeHandler({values: values, by: 'client'});
        }
        this.sendSyncCommand(property);
        return true;
    }

    /**
     * sends syncs command to Syncs Server
     * @param property
     */
    sendSyncCommand(property: any) {
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
    public get data(): any {
        return this.proxy;
    }

    /**
     * apply changes from server to shared object
     * @param values
     */
    public setProperties(values: any) {

        for (let key in values) {
            this.rawData.data[key] = values[key];
        }
        if (this.onChangeHandler) {
            this.onChangeHandler({values: values, by: 'server'});
        }
    }


}


interface SyncsConfig {
    /**
     * Web Socket serving path
     * default is 'ws://server-address/syncs'
     */
    path?: string;

    /**
     * automatically connect on create
     * default is true
     */
    autoConnect?:boolean;

    /**
     * automatically reconnect on unhandled disconnect
     * default is true
     * reconnect delay can be set by reconnectDelay config
     */
    autoReconnect?:boolean;

    /**
     * time to destroy client after disconnect
     * default is 1,000 ms
     */
    reconnectDelay?: number;

    /**
     * enables debug mode
     */
    debug?:boolean;
}