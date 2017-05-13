# syncs-browser
__A JavaScript Library for Real-Time Web Applicforecast_

_syncs-browser_ is browser library to work with [Syncs](https://github.com/manp/syncs). 


## Initialization 
There is three way to setup:
  
 1. Developers can download javascript file from this [link](https://github.com/manp/syncs-browser/releases/tag/1.0) and add the `syncs.js` file to assets directory.
 2. Use CDN hosted file:
    ```html
        <script src="https://cdn.jsdelivr.net/npm/syncs-browser@1"></script>
    ```
 3. On server side it's possible to access client script from `Syncs` instance:
    ```typescript
        app.get('/syncs.js',(req,res)=>{
            res.send(io.clientScript);
        })
    ```
    
 After serving client script, developers should include it in html page and create an instance of `Syncs` class.
 ```html
    <!doctype html>
    <html >
    <head>
    <meta charset="UTF-8">
         <script src="syncs.js"></script>        
    </head>
        <body>
          
        </body>
        <script>
            let io=new Syncs();
        </script>
    </html>
```
Client Script constructor has config parameter:
+ `path:string`: WebSocket url begins with `ws://` protocol. default value is `ws://domain/realtime` which domain name will sets automatically.
+ `autoConnect:boolean`: If `autoConnect` is `false` then the Syncs instance will not connect to server on creation. To connect manuly to server developers should call `io.connect()` method. default value is `true`.
+ `autoReconnect:boolean`: This config makes the connection presistent on connection drop. default value is `true`.
+ `reconnectDelay: number`: time to wait befor each reconnecting try. default value is `10000`.
+ `debug:bolean`: This parameter enables debug mode on client side. default value is `false`.



## Handling connection
Syncs client script can automatically connect to Syncs server. If `autoConnect` config is set to `false`, the developer should connect manualy to server using `connect` method.

Using `connect` method developers can connect to defined server.

```javascript
  io.connect();
```

Target application can establish connection or disconnect from server using provided methods.
```javascript
  io.disconnect()
```

Developers can handle _disconnect_ and _close_ event with `onDisconnect` and `onClose`  method.
```javascript
    io.onDisconnect(()=>{
            
    })
```
```javascript
    io.onClose(()=>{
            
    })
```

It's alos possible to check connection status using `online` property of Syncs instance.
```javascript
  if(io.online){
      //do semething
  }
```



## Abstraction Layers

Syncs provides four abstraction layer over its real-time functionality for developers.


### 1. onMessage Abstraction Layer

Developers can send messages using `send` method of `Syncs` instance to send `JSON` message to the server.Also all incoming messages are catchable using `onMessage`.

```javascript
io.onConnection(client=>{
    io.send({text:"im ready"});
})
```
```javascript
io.onMessage(message=>{
    alert(message.text);
})
```


### 2. Publish and Subscribe Abstraction Layer
 With a Publish and Subscribe solution developers normally subscribe to data using a string identifier. This is normally called a Channel, Topic or Subject.
 
 ```javascript
  io.publish('mouse-move-event',{x:xLocation,y:yLocation});
 ```
 ```javascript
  io.subscribe('weather-update',updates=>{
    // update weather view
  });
 ```
 
  ### 3. Shared Data Abstraction Layer
Syncs provides Shared Data functionality in form of variable sharing. Shared variables can be accessible in tree level: _Global Level_, _Group Level_ and _Client Level_. Only _Client Level_ shared data can be write able with client.

To get _Client Level_ shared object use `shared` method of `Syncs` instance.
```javascript 
  let info=io.shared('info');
  info.title="Syncs is cool!"
```
To get _Group Level_ shared object use `groupShared` method of `Syncs` instance. First parameter is group name and second one is shared object name.

```javascript 
  let info=io.groupShared('vips','info');
  document.title=info.onlineUsers+" vip member are online";
```

To get _Global Level_ shared object use `globalShared` method of `Syncs` instance.
```javascript 
  let settings=io.globalShared('settings');
  applyBackground(settings.background);
```


It's possible to watch changes in shared object by using shared object as a function.
```javascript
  info((event)=>{
    document.title=info.title
  });
```
The callback function has two argument.
+ `values:object`: an object that contains names of changed properties and new values.
+ `by:string` a string variable with two value ( `'server'` and `'client'`) which shows who changed these properties.



### 4. Remote Method Invocation (RMI) Abstraction Layer
With help of RMI developers can call and pass argument to remote function and make it easy to develop robust and web developed application. RMI may abstract things away too much and developers might forget that they are making calls _over the wire_.

Before calling remote method from server ,developer should declare the function on client script.

`functions` object in `Syncs` instance is the place to declare functions.

```javascript
io.functions.showMessage=function(message) {
  alert(message);
}
```

To call remote method on server use `remote` object.

```javascript
  io.remote.setLocation(latitude,longitude)
```



The remote side can return a result (direct value or Promise object) which is accessible using `Promise` object returned by caller side.


```javascript
    io.functions.askName=function(title){
        return prompt(title);
    }
```
```javascript
io.functions.startQuiz=function(questions,quizTime){
    return new Promise((res,rej)=>{
        // start quiz
        setTimeout(()=>{
            res(quizResult);
        },quizTime);

    })
}
```

```javascript
  io.remote.getWeather(cityName).then(forcast=>{
      // show forcast result
  })
```

