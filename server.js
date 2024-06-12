const API = {
    endpoint: "https://api.shoonya.com/NorenWClientTP",
    websocket: "wss://api.shoonya.com/NorenWSTP/",
    debug: false,
    timeout: 7000,
};

const credentials = {
    userid: "FA330127",
    password: "yash@Shoo73",
    twoFA: "OTP/TOTP",
    vendor_code: "FA330127_U",
    api_secret: "a8f4560605d478c4cdac930c135285da",
    imei: "abc1234",
};

class WebSocketClient {
    constructor(apikey, url) {
        this.ws = null;
        this.apikey = apikey;
        this.url = url;
        this.timeout = API.timeout;
        this.triggers = {
            "open": [],
            "quote": [],
            "order": []
        };
    }

    connect(params, callbacks) {
        return new Promise((resolve, reject) => {
            if (!this.apikey || !this.url) return reject("apikey or url is missing");
            this.set_callbacks(callbacks);

            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                setInterval(() => {
                    this.ws.send('{"t":"h"}');
                }, this.timeout);

                const values = {
                    t: "c",
                    uid: params.uid,
                    actid: params.actid,
                    susertoken: params.apikey,
                    source: "API"
                };

                this.ws.send(JSON.stringify(values));
                resolve();
            };

            this.ws.onmessage = (evt) => {
                const result = JSON.parse(evt.data);
                if (result.t === 'ck') this.trigger("open", [result]);
                if (['tk', 'tf', 'dk', 'df'].includes(result.t)) this.trigger("quote", [result]);
                if (result.t === 'om') this.trigger("order", [result]);
            };

            this.ws.onerror = (evt) => {
                console.error("WebSocket error:", evt);
                this.trigger("error", [JSON.stringify(evt.data)]);
                this.connect(params, callbacks);
                reject(evt);
            };

            this.ws.onclose = (evt) => {
                console.log("WebSocket closed");
                this.trigger("close", [JSON.stringify(evt.data)]);
            };
        });
    }

    set_callbacks(callbacks) {
        for (const [key, value] of Object.entries(callbacks)) {
            if (this.triggers.hasOwnProperty(key)) {
                this.on(key, value);
            }
        }
    }

    send(data) {
        this.ws.send(data);
    }

    on(event, callback) {
        if (this.triggers.hasOwnProperty(event)) {
            this.triggers[event].push(callback);
        }
    }

    trigger(event, args) {
        if (!this.triggers[event]) return;
        for (const callback of this.triggers[event]) {
            callback.apply(callback, args ? args : []);
        }
    }

    close() {
        this.ws.close();
    }
}

class NorenRestApi {
    constructor() {
        this.__susertoken = "";
        this.endpoint = API.endpoint;
    }

    async login(params) {
        const pwd = CryptoJS.SHA256(params.password).toString();
        const u_app_key = `${params.userid}|${params.api_secret}`;
        const app_key = CryptoJS.SHA256(u_app_key).toString();

        const authparams = {
            source: "API",
            apkversion: "js:1.0.0",
            uid: params.userid,
            pwd,
            factor2: params.twoFA,
            vc: params.vendor_code,
            appkey: app_key,
            imei: params.imei
        };

        const response = await axios.post(`${this.endpoint}/QuickAuth`, `jData=${JSON.stringify(authparams)}`);
        if (response.data.stat === 'Ok') {
            this.__susertoken = response.data.susertoken;
            this.__username = response.data.actid;
            this.__accountid = response.data.actid;
        }

        return response.data;
    }

    start_websocket(callbacks) {
        this.web_socket = new WebSocketClient(this.__susertoken, API.websocket);

        this.web_socket.connect({
            uid: this.__username,
            actid: this.__accountid,
            apikey: this.__susertoken
        }, callbacks).then(() => {
            console.log('WebSocket is connected');
        }).catch((error) => {
            console.error('WebSocket connection error:', error);
        });
    }

    subscribe(instrument) {
        const values = { t: 't', k: instrument };
        this.web_socket.send(JSON.stringify(values));
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const api = new NorenRestApi();

    try {
        const loginResponse = await api.login(credentials);
        console.log('Login successful:', loginResponse);

        const wsCallbacks = {
            open: () => console.log('WebSocket opened'),
            close: () => console.log('WebSocket closed'),
            error: (error) => console.error('WebSocket error:', error),
            quote: (data) => {
                console.log('Quote received:', data);
                document.getElementById('stockData').innerText = JSON.stringify(data, null, 2);
            },
            order: (data) => console.log('Order received:', data),
        };

        api.start_websocket(wsCallbacks);

        document.getElementById('subscribeButton').addEventListener('click', () => {
            const stockSymbol = document.getElementById('stockSymbol').value;
            if (stockSymbol) {
                api.subscribe(stockSymbol);
                console.log(`Subscribed to ${stockSymbol}`);
            } else {
                alert('Please enter a stock symbol.');
            }
        });
    } catch (error) {
        console.error('Error:', error);
    }
});
