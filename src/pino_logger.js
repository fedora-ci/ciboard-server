/*
 * This file is part of ciboard-server

 * Copyright (c) 2021 Andrei Stepanov <astepano@redhat.com>
 * 
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 * 
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

const pino = require('pino');
const util = require('util');
const debug = require('debug');

/**
 * off, fatal, error, warn, info, debug, trace
 */
const logger = pino({ level: process.env.LOG_LEVEL || 'debug' });

/**
 * https://wildwolf.name/easy-way-to-make-pino-and-debug-work-together/
 */
debug.log = function (s, ...args) {
  logger.debug(util.format(s, ...args));
};

module.exports = logger;
