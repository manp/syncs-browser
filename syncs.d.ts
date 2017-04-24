export interface SyncsConfig {
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
