var base_output = require('../lib/base_output'),
    util = require('util'),
    dgram = require('dgram'),
    logger = require('log4node'),
    zlib = require('zlib'),
    error_buffer = require('../lib/error_buffer');

function OutputGelf() {
  base_output.BaseOutput.call(this);
  this.config = {
    name: 'Udp',
    host_field: 'host',
    port_field: 'port',
    optional_params: ['error_buffer_delay', 'version', 'message', 'facility', 'level', 'include_fields'],
    default_values: {
      'error_buffer_delay': 2000,
      'version': '1.0',
      'message': '#{@message}',
      'facility': '#{@type}',
      'level': '6',
	  'include_fields': false
    }
  }
}

util.inherits(OutputGelf, base_output.BaseOutput);

OutputGelf.prototype.afterLoadConfig = function(callback) {
  logger.info('Start GELF output to', this.host + ':' + this.port);

  this.socket = dgram.createSocket('udp4');

  this.error_buffer = error_buffer.create('output GELF to ' + this.host + ':' + this.port, this.error_buffer_delay, this);

  callback();
}

OutputGelf.prototype.process = function(data) {
  var m = {
    version: this.version,
    short_message: this.replaceByFields(data, this.message),
    facility: this.replaceByFields(data, this.facility) || 'no_facility',
    level: this.replaceByFields(data, this.level),
    host: data['@source_host'],
    timestamp: (new Date(data['@timestamp'])).getTime() / 1000,
  };

  if (this.include_fields) {
    extend(m, data['@fiields']);
  }

  if (!m.short_message) {
    return;
  }

  logger.debug('Sending GELF', m);

  zlib.deflate(new Buffer(JSON.stringify(m)), function(err, message) {
    if (err) {
      return this.emit('error', new Error('Error while compressing data:' + err));
    }

    this.socket.send(message, 0, message.length, this.port, this.host, function(err, bytes) {
      if (err || bytes != message.length) {
        this.error_buffer.emit('error', new Error('Error while send data to ' + this.host + ':' + this.port + ':' + err));
      }
    }.bind(this));
  }.bind(this));
}

OutputGelf.prototype.close = function(callback) {
  logger.info('Closing GELF output to udp', this.host + ':' + this.port);

  this.socket.close();

  callback();
}

exports.create = function() {
  return new OutputGelf();
}

var extend = (function(){

    var toString = Object.prototype.toString,
        obj = '[object Object]';

    return function extend( deep /*, obj1, obj2, obj3 */ ) {
        // take first argument, if its not a boolean
        var args = arguments,
            i = deep === true ? 1 : 0,
            key,
            target = args[i];

        for ( ++i; i < args.length; ++i ) {
            for (key in args[i]) {
                if ( deep === true &&
                     target['_' + key] &&
                     // if not doing this check you may end in
                     // endless loop if using deep option
                     toString.call(args[i][key]) === obj &&
                     toString.call(target['_' + key]) === obj ) {

                    extend( deep, target['_' + key], args[i][key] );
                } else {
                    target['_' + key] = args[i][key];
                }
            }
        }

        return target;
    };
}());

