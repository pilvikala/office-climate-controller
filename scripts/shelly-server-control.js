// this is a script for Shelly power socket with a heater attached to it.
// it will check the server for state recommendation and turn on the heater when the recommendation is to turn on
// and turn off the heater when the recommendation is to turn off


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
    const state = parsed.state;
    if (state === 1) {
        setOn()
    } else {
        setOff();
    }
}

function makeRequest() {
    Shelly.call(
        "HTTP.GET",
        {
            "url": "http://192.168.3.106:3000/api/power-socket/recommendation",
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