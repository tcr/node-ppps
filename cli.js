#!/usr/bin/env node

var ppps = require('./index');
var nomnom = require('nomnom');

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

ppps.findHubs(vendor, product, function (err, hubs) {
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
