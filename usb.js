#!/usr/bin/env node

var usb = require('usb');
var nomnom = require('nomnom');
var async = require('async');

usb.Device.prototype.timeout = 5000;

var USB_DIR_IN = 0x80
var USB_RT_HUB = usb.LIBUSB_REQUEST_TYPE_CLASS | usb.LIBUSB_RECIPIENT_DEVICE;
var USB_RT_PORT = usb.LIBUSB_REQUEST_TYPE_CLASS | usb.LIBUSB_RECIPIENT_OTHER;
var USB_PORT_FEAT_POWER = 8;
var USB_PORT_FEAT_INDICATOR = 22;

function Port (unit, index) {
    this.unit = unit;
    this.index = index;
    this.status = null;
}

Port.prototype.control = function (power, next) {
    this.status = power;
    var request = power && power != 'off' ? usb.LIBUSB_REQUEST_SET_FEATURE : usb.LIBUSB_REQUEST_CLEAR_FEATURE;
    var feature = USB_PORT_FEAT_POWER;
    this.unit.controlTransfer(USB_RT_PORT, request, feature, this.index+1, new Buffer([]), next || function () { });
}

function Hub (unit) {
    this.unit = unit;
}

Hub.prototype.initialize = function (next) {
    this.unit.open();
    this.unit.controlTransfer(USB_RT_HUB | USB_DIR_IN, usb.LIBUSB_REQUEST_GET_DESCRIPTOR, usb.LIBUSB_DT_HUB << 8, 0, 1024, function (err, data) {
        var hub = (data[4] << 8) | data[3];
        if (((hub & 0x03) != 0) && ((hub & 0x03) != 1)) {
            next(new Error('Cannot use per-port power switching on USB 1.0 hub.'));
        } else {
            next(null);
        }
    }.bind(this));
}

Hub.prototype.close = function (next) {
    var err = this.unit.close();
    next && next(err);
}

Hub.prototype.port = function (i) {
    return new Port(this.unit, i);
} 

function findHubs (vendor, product, next) {
    var devices = usb.getDeviceList();

    var hubs = devices.filter(function (d) {
        return d.deviceDescriptor.bDeviceClass == usb.LIBUSB_CLASS_HUB;
    }).filter(function (d) {
        return d.deviceDescriptor.idVendor == vendor && d.deviceDescriptor.idProduct == product;
    }).sort(function (a, b) {
        return a.bus < b.bus ? -1 : a.bus > b.bus ? 1
          : a.deviceAddress < b.deviceAddress ? -1 : a.deviceAddress > b.deviceAddress ? 1
          : 0;
    }).map(function (d) {
        return new Hub(d);
    });

    async.filter(hubs, function (hub, next) {
        hub.initialize(function (err) {
            next(!err);
        });
    }, next.bind(null, null));
}

var opts = nomnom
    .options({
        vendor: {
            abbr: 'V',
            required: true,
            help: 'vendorId:productId (e.g. 05e3:0608)',
        },
        hub: {
            abbr: 'H',
            required: false,
            help: 'hub number'
        },
        port: {
            abbr: 'P',
            required: false,
            help: 'port number'
        },
        power: {
            abbr: 'W',
            required: false,
            default: 0,
            help: 'power value 0 or 1'
        },
    })
    .parse();

var vendor = parseInt('0x' + opts.vendor.replace(/:.*/, ''), 16);
var product = parseInt('0x' + opts.vendor.replace(/^.*:/, ''), 16);

findHubs(vendor, product, function (err, hubs) {
    if ('hub' in opts && 'port' in opts) {
        var hub = hubs[parseInt(opts.hub)];
        if (!hub) console.error('no hub at #%d connected.', opts.hub), process.exit(1);
        var port = hub.port(parseInt(opts.port))
        if (!port) console.error('no port at hub #%d port #%d connected.', opts.hub, opts.port), process.exit(1);
        port.control(parseInt(opts.power), function (err) {
            if (err) {
                console.error(err.stack);
            } else {
                console.log('hub %d port %d set to %d', opts.hub, opts.port, opts.power)
            }
            closeHubs();
        });
    } else {
        hubs.forEach(function (h, i) {
            console.log('hub #%d: bus number %d, device address %d', i, h.unit.busNumber, h.unit.deviceAddress);
        });
        if (!hubs.length) {
            console.error('No per-power port enabled hubs matching %s:%s found.', vendor.toString(16), product.toString(16));
        }
        closeHubs();

    }

    function closeHubs () {
        hubs.forEach(function (hub) {
            hub.close(function (err) {
                if (err) console.error(err.stack);
            });
        })
    }
});

// hubs[0].port(1).control(true);

/*

optional

sudo tee /etc/udev/rules.d/85-dlock.rules > /dev/null << EOF
ATTRS{idVendor}=="05e3", ATTRS{idProduct}=="0608", ENV{ID_MM_DEVICE_IGNORE}="1", MODE="0666"
EOF
sudo udevadm control --reload-rules

*/
