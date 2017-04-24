declare class Syncs {
    /*************** PROPERTIES ****************/
    private socket;
    private socketId;
    online: boolean;
    private configs;
    private onMessageListeners;
    private handledClose;
    private subscriptions;
    private globalSharedObjects;
    private groupSharedObjects;
    private clientSharedObjects;
    private onOpenListener;
    private onDisconnectListener;
    private onCloseListener;
    private functionProxy;
    private rmiFunctions;
    private rmiResultCallbacks;
    /**
     * @constructor
     * @param path
     * @param debug
     */
    constructor(configs?: SyncsConfig);
    /**
     * initialize configuration with user inputs or default configurations
     * @param {SyncsConfig} configs
     */
    private initializeConfigs(configs);
    /**
     * enables debug mode
     */
    enableDebugMode(): void;
    /**
     * disables debug mode
     */
    disableDebugMode(): void;
    /**
     * connects to Syncs server
     */
    connect(): void;
    /**
     * handles incoming messages
     */
    private handleOnMessage();
    /**
     * handle connection close
     */
    private handleOnClose();
    /**
     * disconnect from Syncs server
     */
    disconnect(): void;
    /**
     * handle open event
     * open event will emit on first connection
     * @param { (server: Syncs) => {} } callback
     */
    onOpen(callback: (server: Syncs) => void): void;
    /**
     * handle close event
     * this event will emit on close
     * @param { (server: Syncs) => {} } callback
     */
    onClose(callback: (server: Syncs) => void): void;
    /**
     * handle disconnect event
     * this event will emit on unhandled close
     * @param { (server: Syncs) => {} } callback
     */
    onDisconnect(callback: (server: Syncs) => void): void;
    /**
     * parse incoming message
     * returns parsed object or false if message is not valid
     * @param {string} message
     * @return {any|false}
     */
    private parseMessage(message);
    /**
     * handle incoming command
     * @param {any} command
     */
    private handleCommand(command);
    /**
     * send socketId to Syncs server
     */
    private sendSocketId();
    /**
     * handle incoming message
     * @param { (message: any) => void } listener
     */
    onMessage(listener: (message: any) => void): void;
    /**
     * send message to Syncs server
     * @param {any} message
     * @return {boolean}
     */
    send(message: any): boolean;
    /**
     * send message as syncs-command
     * @param {any} message
     * @return {boolean}
     */
    sendCommand(message: any): boolean;
    /**************  EVENT LAYER ******************/
    /**
     * handle incomming event
     * @param {any} command
     */
    private handleEvent(command);
    /**
     * subscribe on incoming event
     * @param {string} event
     * @param { (data: any) => void } callback
     */
    subscribe(event: string, callback: (data: any) => void): void;
    /**
     * un-subscribe from event
     * @param {string} event
     * @param {callback: (data: any) => void} callback
     */
    unSubscribe(event: string, callback: (data: any) => void): void;
    /**
     * publish an event to Syncs Server
     * @param {string} event
     * @param {any} data
     * @return {boolean}
     */
    publish(event: string, data: any): boolean;
    /**************  SHARED OBJECT LAYER ******************/
    /**
     * handle shared object sync command
     * @param command
     */
    private handleSync(command);
    /**
     * changes global shared object value
     * @param command
     */
    private setGlobalSharedObject(command);
    /**
     * changes group shared object value
     * @param command
     */
    private setGroupSharedObject(command);
    /**
     * changes client shared object value
     * @param command
     */
    private setClientSharedObject(command);
    /**
     * returns client level shared object
     * @param {string} name
     * @return {any}
     */
    shared(name: string): any;
    /**
     * return group level shared object
     * @param {string} group
     * @param {string} name
     * @return {any}
     */
    groupShared(group: string, name: string): any;
    /**
     *
     * @param name
     * @return {any}
     */
    globalShared(name: string): any;
    /**************  RMI LAYER ******************/
    /**
     * returns functions array
     * functions array is the place to initialize rmi functions
     * @return {any}
     */
    readonly functions: any;
    /**
     * handle incoming rmi command
     * @param {string} command
     */
    private handleRMICommand(command);
    /**
     * returns an remote functions object
     * remote functions object is the place to call remote functions
     * called method will return Promise to get result from remote
     * @return {any}
     */
    readonly remote: any;
    /**
     * handles proxy get for remote method invocation
     * @param target
     * @param property
     * @param receiver
     * @return {()=>Promise<T>}
     */
    private onGetRemoteMethod(target, property, receiver);
    /**
     * generates request id for RMI
     * @return {string}
     */
    private generateRMIRequestUID();
    /**
     * handles rmi-result command
     * @param command
     */
    private handleRmiResultCommand(command);
    /**
     * sends rmi calling command to Syncs server;
     * @param {string} name
     * @param {any} args
     * @param {string} id
     */
    private sendRMICommand(name, args, id);
    /**
     * send rmi-result command to SyncsServer
     * @param result
     * @param error
     * @param id
     */
    private sendRmiResultCommand(result, error, id);
}
/**
 * Shared Object Class to create Shared Object functionality
 */
declare class SharedObject {
    name: string;
    rawData: any;
    private type;
    private readOnly;
    private proxy;
    private server;
    private onChangeHandler;
    private constructor();
    /**
     * creates a global level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    static globalLevel(name: string, initializeData: any, server: Syncs): SharedObject;
    /**
     * creates group level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    static groupLevel(name: string, initializeData: {}, server: Syncs): SharedObject;
    /**
     * creates client level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    static clientLevel(name: string, initializeData: {}, server: Syncs): SharedObject;
    /**
     * initialize proxy object to observe changes in raw data
     */
    private initialize();
    /**
     * returns handlers for proxy
     * @return {{get: ((target:any, property:any, receiver:any)=>any|string|number), set: ((target:any, property:any, value:any, receiver:any)=>boolean), apply: ((target:any, thisArg:any, argumentsList:any)=>any)}}
     */
    private getHandler();
    private onGet(target, property, receiver);
    private onApply(target, thisArg, argumentsList);
    private onSet(target, property, value, receiver);
    /**
     * sends syncs command to Syncs Server
     * @param property
     */
    sendSyncCommand(property: any): void;
    /**
     * returns abstracted shared object as a proxy
     * @return {any}
     */
    readonly data: any;
    /**
     * apply changes from server to shared object
     * @param values
     */
    setProperties(values: any): void;
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
    autoConnect?: boolean;
    /**
     * automatically reconnect on unhandled disconnect
     * default is true
     * reconnect delay can be set by reconnectDelay config
     */
    autoReconnect?: boolean;
    /**
     * time to destroy client after disconnect
     * default is 1,000 ms
     */
    reconnectDelay?: number;
    /**
     * enables debug mode
     */
    debug?: boolean;
}
