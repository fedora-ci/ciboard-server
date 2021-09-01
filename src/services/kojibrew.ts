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

import _ from 'lodash';
import retry from 'retry';
import debug from 'debug';
import xmlrpc from 'xmlrpc';

import { getcfg } from '../cfg';
const cfg = getcfg();

const log = debug('osci:kojibrew');

const koji_clients = {
  brew: xmlrpc.createSecureClient(cfg.koji_brew),
  fedoraproject: xmlrpc.createSecureClient(cfg.koji_fp),
  centos_stream: xmlrpc.createSecureClient(cfg.koji_cs),
};

export type koji_instances = keyof typeof koji_clients;

/**
 * Inspired by: https://stackoverflow.com/questions/56074531/how-to-retry-5xx-requests-using-axios
 */
export const koji_query = async (
  hub_name: koji_instances,
  method: string,
  ...args: any[]
): Promise<any> => {
  const operation = retry.operation({
    retries: 5,
    factor: 3,
    minTimeout: 1 * 1000,
    maxTimeout: 60 * 1000,
    randomize: true,
  });
  return new Promise((resolve, reject) => {
    operation.attempt((currentAttempt) => {
      log(' [i] Query for %s: %o, attempt %s', method, args, currentAttempt);
      koji_clients[hub_name].methodCall(
        method,
        args,
        function (error: any, value) {
          if (error) {
            console.log('error:', error);
            console.log('req headers:', error.req && error.req._header);
            console.log('res code:', error.res && error.res.statusCode);
            console.log('res body:', error.body);
            if (operation.retry(error)) {
              /**
               * Returns false when no error value is given, or the maximum amount of retries has been reached.
               * Otherwise it returns true, and retries the operation after the timeout for the current attempt number.
               * Can try more.
               */
              return;
            }
            reject(error);
          } else {
            log("Response for '%s':\n%o", method, value);
            resolve(value);
          }
        }
      );
    });
  });
};
