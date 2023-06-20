/*
 * This file is part of ciboard-server
 *
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

const util = require('util');

const debug = require('debug');
const pino = require('pino');
const pinoPretty = require('pino-pretty');
const pinoSentry = require('pino-sentry');

/*
 * Pretty-print log messages to the console-using pino-pretty. In addition
 * to that, forward warnings (and higher-level messages) to Sentry, if enabled.
 */
const pinoStreams = pino.multistream([
  {
    stream: pinoPretty(),
    level: process.env.LOG_LEVEL || 'debug',
  },
  /*
   * Note: The Sentry DSN is read automatically from the environment variable
   * SENTRY_DSN, as specified in the DeploymentConfig. If no DSN is specified,
   * this stream does nothing.
   */
  { stream: pinoSentry.createWriteStream(), level: 'warn' },
]);

/**
 * off, fatal, error, warn, info, debug, trace
 */

export const logger = pino.pino(
  {
    level: 'debug', // this MUST be set at the lowest level of the destinations according to the documentation
  },
  pinoStreams,
);

/**
 * https://wildwolf.name/easy-way-to-make-pino-and-debug-work-together/
 */
debug.log = function (s, ...args) {
  logger.debug(util.format(s, ...args));
};
