// this is a script for Shelly power socket with a heater attached to it.

function setOn() {
    print("setting on")
    Shelly.call("Switch.set", { 'id': 0, 'on': true });
}

function setOff() {
    print("setting off")
    Shelly.call("Switch.set", { 'id': 0, 'on': false });
}

function processResponse(data) {
    if (!data || !data.body) {
        print("did not receive any data")
        return;
    }
    print(data.body)
    const parsed = JSON.parse(data.body);
    const current = parsed.currentTemperature;
    const target = parsed.targetTemperature;
    if (current < target) {
        setOn()
    } else {
        setOff()
    }
}

function makeRequest() {
    Shelly.call(
        "HTTP.GET",
        {
            "url": "http://192.168.3.106:3000/api/temperature/status",
        },
        processResponse
    );
};

Timer.set(
    /* number of miliseconds */ 1000 * 60 * 3,
    /* repeat? */ true,
    /* callback */ makeRequest
);

makeRequest();